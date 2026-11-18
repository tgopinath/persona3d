/* eslint-disable @typescript-eslint/no-explicit-any -- reads a dev-only debug handle on window */
// End-to-end journey in real Chrome (headless, SwiftShader WebGL).
// Usage: npm run dev (port 3410) then: npx tsx scripts/e2e.mts
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import puppeteer, { type ElementHandle } from "puppeteer-core";

const BASE = process.env.E2E_BASE ?? "http://localhost:3410";
const OUT = process.env.E2E_OUT ?? "/tmp/claude-502/shots";
fs.mkdirSync(OUT, { recursive: true });

/** Synthetic portrait: noisy background, skin-tone face, dark hair, blue top. */
function portrait(w: number, h: number, turn = 0) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const fx = (x - w * (0.5 + turn * 0.08)) / (w * 0.17), fy = (y - h * 0.3) / (h * 0.16);
      let c: number[] = [228, 226, 222];
      if (fx * fx + fy * fy < 1) c = [205, 150, 118];
      if (fx * fx + (fy + 0.7) ** 2 < 0.9 && fy < -0.3) c = [40, 28, 20];
      if (y > h * 0.5) c = [52, 92, 200];
      if (y > h * 0.82) c = [35, 38, 50];
      const n = (rnd() - 0.5) * 40;
      raw.set(c.map((v) => Math.max(0, Math.min(255, v + n))), y * (w * 3 + 1) + 1 + x * 3);
    }
  }
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([l, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const front = path.join(OUT, "front.png"); fs.writeFileSync(front, portrait(800, 1000));
const left = path.join(OUT, "left.png"); fs.writeFileSync(left, portrait(800, 1000, -1));

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1440,900"],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${(e as Error).message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
const shot = (n: string) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const clickText = async (sel: string, text: string) => {
  await page.waitForFunction((s, t) => [...document.querySelectorAll(s)].some((e) => e.textContent?.includes(t) && !(e as HTMLButtonElement).disabled), { timeout: 30000 }, sel, text);
  await page.evaluate((s, t) => ([...document.querySelectorAll(s)].find((e) => e.textContent?.includes(t) && !(e as HTMLButtonElement).disabled) as HTMLElement).click(), sel, text);
};
const step = (s: string) => console.log("✓", s);

try {
  await page.goto(`${BASE}/create`, { waitUntil: "networkidle2" });
  await page.waitForSelector('input[type="checkbox"]');
  await page.click('input[type="checkbox"]');
  const up = async (label: string, file: string) => {
    const input = await page.waitForSelector(`[aria-label="Upload ${label} photo"] input[type=file]`);
    await (input as ElementHandle<HTMLInputElement>).uploadFile(file);
  };
  await up("Front", front);
  await page.waitForFunction(() => /Excellent|Good|Fair|Retake/.test(document.body.innerText), { timeout: 30000 });
  await up("Left profile", left);
  await page.waitForFunction(() => (document.body.innerText.match(/\d+% (Excellent|Good|Fair|Retake)/g) ?? []).length >= 2, { timeout: 30000 });
  step("uploaded 2 photos with quality badges");
  await shot("e2e-1-upload");

  await clickText("button", "Continue");
  await page.waitForFunction(() => document.body.innerText.includes("Check photo quality"));
  await shot("e2e-2-quality");
  step("quality step");
  await clickText("button", "Continue");
  await clickText('button[role="radio"]', "Cartoon 3D");
  await shot("e2e-3-style");
  step("style step");
  await clickText("button", "Continue");
  await page.type('input[placeholder="e.g. Weekend Me"]', "E2E Hero");
  await page.type("textarea", "round glasses and a beard");
  await clickText("button", "Continue");
  await page.waitForFunction(() => document.body.innerText.includes("Generation service"));
  const boxes = await page.$$('input[type="checkbox"]');
  await boxes[boxes.length - 1].click();
  await shot("e2e-4-settings");
  step("settings step");
  await clickText("button", "Generate My 3D Character");
  await page.waitForFunction(() => document.body.innerText.includes("Building your character") || document.body.innerText.includes("Waiting for a worker") || document.body.innerText.includes("ready"), { timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));
  await shot("e2e-5-generating");
  await page.waitForFunction(() => document.body.innerText.includes("Your character is ready"), { timeout: 90000 });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading 3D model") && !!(window as any).__persona3d?.model, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  await shot("e2e-6-ready");
  step("generation completed and model loaded in viewer");

  const id = new URL(page.url()).searchParams.get("c");
  await page.goto(`${BASE}/characters/${id}`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !!(window as any).__persona3d?.model, { timeout: 30000 });
  await clickText("button", "Face");
  await new Promise((r) => setTimeout(r, 1500));
  await shot("e2e-7-viewer-face");
  step("viewer face close-up");

  await page.goto(`${BASE}/studio/animate?c=${id}`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !!(window as any).__persona3d?.model, { timeout: 30000 });
  await clickText("button", "Dancing");
  await new Promise((r) => setTimeout(r, 1200));
  await shot("e2e-8-dancing");
  await page.type("#motion-prompt", "walk towards the camera and wave");
  await clickText("button", "Animate");
  await page.waitForFunction(() => document.body.innerText.includes("Preset match"), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
  await shot("e2e-9-prompt");
  step("animation studio: preset + prompt sequence");

  await page.goto(`${BASE}/studio/customise?c=${id}`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => document.body.innerText.includes("Hair colour"), { timeout: 30000 });
  await clickText('[role="tab"]', "clothing");
  await clickText("button", "Fantasy");
  await clickText("button", "Save changes");
  await page.waitForFunction(() => document.body.innerText.includes("Changes saved"), { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 800));
  await shot("e2e-10-customise");
  step("customisation saved");

  await page.goto(`${BASE}/studio/export?c=${id}`, { waitUntil: "networkidle2" });
  await page.waitForFunction(() => !!(window as any).__persona3d?.model, { timeout: 30000 });
  await clickText("button", "Download");
  await page.waitForFunction(() => document.body.innerText.includes("Exported"), { timeout: 30000 });
  await clickText('button[role="radio"]', "Still render");
  await clickText("button", "Render PNG");
  await page.waitForFunction(() => (document.body.innerText.match(/Exported/g) ?? []).length >= 1 && document.body.innerText.includes(".png"), { timeout: 30000 });
  await clickText('button[role="radio"]', "Turntable video");
  await clickText("button", "720p");
  await clickText("button", "Render video");
  await page.waitForFunction(() => /Exported .*turntable_5s\.(mp4|webm)/.test(document.body.innerText), { timeout: 60000 });
  await shot("e2e-11-export");
  const exportsRes = await page.evaluate(async (cid) => (await fetch(`/api/characters/${cid}/exports`)).json(), id);
  step(`exports recorded: ${exportsRes.exports.map((e: { export_format: string }) => e.export_format).join(", ")}`);

  await page.goto(`${BASE}/characters`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1000));
  await shot("e2e-12-library");
  step("library");

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/create`, { waitUntil: "networkidle2" });
  await shot("e2e-13-mobile-create");
  await page.goto(`${BASE}/characters/${id}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2500));
  await shot("e2e-14-mobile-viewer");
  step("mobile layouts");
} catch (e) {
  await shot("e2e-failure");
  console.error("✗", (e as Error).message);
  process.exitCode = 1;
} finally {
  const real = errors.filter((e) => !/Download the React DevTools|favicon/.test(e));
  console.log(real.length ? `Console errors:\n${real.slice(0, 15).join("\n")}` : "No console errors");
  await browser.close();
}
