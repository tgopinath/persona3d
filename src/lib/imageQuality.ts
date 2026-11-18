// Client-side photo quality estimation on a downscaled canvas.
// These are image-quality ESTIMATES (lighting, sharpness, resolution, framing),
// not identity verification. The UI presents them that way.

import type { Angle, AppearanceHints } from "./types";

export interface QualityCheck {
  id: "resolution" | "lighting" | "sharpness" | "subject" | "background" | "consistency";
  label: string;
  score: number; // 0..100
  message?: string;
}

export interface QualityReport {
  score: number;
  grade: "excellent" | "good" | "fair" | "retake";
  checks: QualityCheck[];
  recommendations: string[];
  width: number;
  height: number;
  /** Colour signature for cross-photo consistency (skin-ish region hue histogram). */
  signature: number[];
  colors: AppearanceHints;
}

const ANGLE_LABEL: Record<Angle, string> = {
  front: "front",
  three_quarter_left: "three-quarter left",
  left: "left-profile",
  three_quarter_right: "three-quarter right",
  right: "right-profile",
  back: "back",
};

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));

export const grade = (s: number): QualityReport["grade"] => (s >= 85 ? "excellent" : s >= 70 ? "good" : s >= 50 ? "fair" : "retake");
export const GRADE_LABEL = { excellent: "Excellent", good: "Good", fair: "Fair", retake: "Retake recommended" };

function isSkin(r: number, g: number, b: number) {
  // Classic RGB skin heuristic (Kovac et al.) — broad, works across skin tones in decent light.
  return r > 60 && g > 30 && b > 15 && r > g && r > b && r - Math.min(g, b) > 12 && Math.abs(r - g) > 8;
}

function toHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
}

function avg(data: Uint8ClampedArray, w: number, x0: number, y0: number, x1: number, y1: number, pred?: (r: number, g: number, b: number) => boolean) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(y0); y < y1; y++)
    for (let x = Math.floor(x0); x < x1; x++) {
      const i = (y * w + x) * 4;
      if (pred && !pred(data[i], data[i + 1], data[i + 2])) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  return n ? { r: r / n, g: g / n, b: b / n, n } : null;
}

export async function analyseImage(file: Blob, angle: Angle): Promise<QualityReport> {
  const bmp = await createImageBitmap(file);
  const W = 256;
  const scale = W / Math.max(bmp.width, bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const width = bmp.width, height = bmp.height;
  bmp.close();

  // Luminance stats
  const lum = new Float32Array(w * h);
  let sum = 0;
  for (let i = 0; i < w * h; i++) {
    const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
    lum[i] = l;
    sum += l;
  }
  const mean = sum / (w * h);
  let varSum = 0;
  for (let i = 0; i < w * h; i++) varSum += (lum[i] - mean) ** 2;
  const contrast = Math.sqrt(varSum / (w * h));

  // Sharpness: variance of Laplacian
  let lapSum = 0, lapSq = 0, ln = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      lapSum += v; lapSq += v * v; ln++;
    }
  const lapVar = lapSq / ln - (lapSum / ln) ** 2;

  // Subject: skin-like pixels in the upper-centre region (face/head area)
  const cx0 = w * 0.25, cx1 = w * 0.75, cy0 = h * 0.05, cy1 = h * 0.55;
  let skin = 0, region = 0;
  for (let y = Math.floor(cy0); y < cy1; y++)
    for (let x = Math.floor(cx0); x < cx1; x++) {
      const i = (y * w + x) * 4;
      region++;
      if (isSkin(data[i], data[i + 1], data[i + 2])) skin++;
    }
  const skinRatio = skin / region;

  // Background interference: edge density along the border vs. centre
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    let e = 0, n = 0;
    for (let y = Math.max(1, Math.floor(y0)); y < Math.min(h - 1, y1); y++)
      for (let x = Math.max(1, Math.floor(x0)); x < Math.min(w - 1, x1); x++) {
        const i = y * w + x;
        e += Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + w] - lum[i - w]);
        n++;
      }
    return n ? e / n : 0;
  };
  const border = (edge(0, 0, w, h * 0.12) + edge(0, h * 0.88, w, h) + edge(0, 0, w * 0.12, h) + edge(w * 0.88, 0, w, h)) / 4;
  const centre = edge(w * 0.3, h * 0.2, w * 0.7, h * 0.8) || 1;

  // Colour sampling for appearance hints
  const skinAvg = avg(data, w, cx0, cy0, cx1, cy1, isSkin);
  // Hair: the band just above the first row where the face (skin) appears.
  let faceTop = -1;
  for (let y = 0; y < h * 0.6 && faceTop < 0; y++) {
    let n = 0;
    for (let x = Math.floor(w * 0.35); x < w * 0.65; x++) {
      const i = (y * w + x) * 4;
      if (isSkin(data[i], data[i + 1], data[i + 2])) n++;
    }
    if (n > w * 0.3 * 0.25) faceTop = y;
  }
  const hy = faceTop > 0 ? faceTop : h * 0.12;
  const hairAvg = avg(data, w, w * 0.38, Math.max(0, hy - h * 0.07), w * 0.62, hy + h * 0.01, (r, g, b) => !isSkin(r, g, b) && r + g + b < 600);
  const topAvg = avg(data, w, w * 0.3, h * 0.6, w * 0.7, h * 0.78, (r, g, b) => !isSkin(r, g, b));
  const bottomAvg = avg(data, w, w * 0.35, h * 0.85, w * 0.65, h * 0.98, (r, g, b) => !isSkin(r, g, b));

  // Hue histogram signature (8 bins) of skin pixels + mean luminance bucket
  const sig = new Array(9).fill(0);
  for (let i = 0; i < w * h; i += 2) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (!isSkin(r, g, b)) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const hue = mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    sig[Math.min(7, Math.floor((hue / 6) * 8))]++;
  }
  const total = sig.reduce((a, b) => a + b, 0) || 1;
  for (let k = 0; k < 8; k++) sig[k] /= total;
  sig[8] = skinAvg ? (skinAvg.r + skinAvg.g + skinAvg.b) / 765 : 0;

  // ── Scores ──
  const short = Math.min(width, height);
  const resolution = clamp(((short - 384) / (1024 - 384)) * 100);
  const lighting = clamp(100 - Math.abs(mean - 125) * 0.9 - Math.max(0, 35 - contrast) * 1.5);
  const sharpness = clamp((Math.log10(lapVar + 1) - 1.2) * 70);
  const subjectExpected = angle === "back" ? 0 : angle === "left" || angle === "right" ? 0.06 : 0.1;
  const subject = angle === "back" ? 80 : clamp((skinRatio / subjectExpected) * 85);
  const background = clamp(110 - (border / centre) * 60);

  const checks: QualityCheck[] = [
    { id: "resolution", label: "Resolution", score: Math.round(resolution) },
    { id: "lighting", label: "Lighting", score: Math.round(lighting) },
    { id: "sharpness", label: "Sharpness", score: Math.round(sharpness) },
    { id: "subject", label: angle === "back" ? "Framing" : "Face visibility", score: Math.round(subject) },
    { id: "background", label: "Background", score: Math.round(background) },
  ];
  const a = ANGLE_LABEL[angle];
  const recs: string[] = [];
  if (resolution < 50) recs.push(`Your ${a} photo is ${width}×${height}. Use a photo at least 1024px on the short side.`);
  if (mean < 70) recs.push(`Your ${a} photograph is too dark. Upload another photograph with better lighting.`);
  else if (mean > 200) recs.push(`Your ${a} photograph looks overexposed. Avoid direct light or a bright window behind you.`);
  else if (lighting < 55) recs.push(`Lighting in your ${a} photo is flat. Soft, even light from the front works best.`);
  if (sharpness < 45) recs.push(`Your ${a} photo looks blurry. Hold the camera steady or tap to focus.`);
  if (angle !== "back" && subject < 45) recs.push(`We couldn't clearly see a face in the ${a} photo. Make sure the face is unobstructed and centred.`);
  if (background < 50) recs.push(`The ${a} background is busy. A plain wall behind the person improves reconstruction.`);

  const weights = { resolution: 0.2, lighting: 0.25, sharpness: 0.25, subject: 0.2, background: 0.1 };
  const score = Math.round(checks.reduce((s, c) => s + c.score * weights[c.id as keyof typeof weights], 0));

  return {
    score,
    grade: grade(score),
    checks,
    recommendations: recs,
    width,
    height,
    signature: sig,
    colors: {
      skin: skinAvg && skinAvg.n > 30 ? toHex(skinAvg.r, skinAvg.g, skinAvg.b) : undefined,
      hair: hairAvg ? toHex(hairAvg.r * 0.9, hairAvg.g * 0.9, hairAvg.b * 0.9) : undefined,
      top: topAvg ? toHex(topAvg.r, topAvg.g, topAvg.b) : undefined,
      bottom: bottomAvg ? toHex(bottomAvg.r, bottomAvg.g, bottomAvg.b) : undefined,
    },
  };
}

/**
 * Pairwise similarity of skin-colour signatures. Low similarity suggests the
 * photos may show different people or very different lighting — a warning, not proof.
 */
export function consistency(reports: { angle: Angle; report: QualityReport }[]) {
  const withFace = reports.filter((r) => r.angle !== "back" && r.report.signature[8] > 0);
  if (withFace.length < 2) return { score: null as number | null, outliers: [] as Angle[] };
  const dist = (a: number[], b: number[]) => {
    let d = 0;
    for (let i = 0; i < 8; i++) d += Math.abs(a[i] - b[i]);
    return d / 2 + Math.abs(a[8] - b[8]) * 1.5;
  };
  const outliers: Angle[] = [];
  let totalSim = 0, pairs = 0;
  for (const r of withFace) {
    const others = withFace.filter((o) => o !== r);
    const meanD = others.reduce((s, o) => s + dist(r.report.signature, o.report.signature), 0) / others.length;
    if (meanD > 0.45) outliers.push(r.angle);
    for (const o of others) {
      totalSim += 1 - Math.min(1, dist(r.report.signature, o.report.signature));
      pairs++;
    }
  }
  return { score: Math.round((totalSim / pairs) * 100), outliers };
}

/** Merge per-photo colour samples into one appearance, preferring the front view. */
export function mergeAppearance(reports: { angle: Angle; report: QualityReport }[]): AppearanceHints {
  const order: Angle[] = ["front", "three_quarter_left", "three_quarter_right", "left", "right", "back"];
  const sorted = [...reports].sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle));
  const out: AppearanceHints = {};
  for (const k of ["skin", "hair", "top", "bottom"] as const) out[k] = sorted.find((r) => r.report.colors[k])?.report.colors[k];
  return out;
}
