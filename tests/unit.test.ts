import { describe, expect, it } from "vitest";
import { imageSize, sniffImage } from "@/lib/imageFile";
import { buildRetargetMap } from "@/lib/character/skeleton";
import { planMotion } from "@/lib/motionPrompt";
import { CLIPS } from "@/lib/animation/library";
import { inspectGlb } from "@/lib/glbInspect";
import { makePng } from "./helpers";

describe("image sniffing", () => {
  it("detects PNG and reads dimensions", () => {
    const png = makePng(640, 480);
    expect(sniffImage(png)).toBe("png");
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });
  });
  it("rejects non-images", () => {
    expect(sniffImage(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
  it("reads JPEG SOF dimensions", () => {
    // SOI, APP0 stub, SOF0 with 300x200
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xc8, 0x01, 0x2c, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImage(jpg)).toBe("jpeg");
    expect(imageSize(jpg)).toEqual({ width: 300, height: 200 });
  });
});

describe("retarget map", () => {
  it("maps Mixamo bone names", () => {
    const names = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot", "RightUpLeg", "RightLeg", "RightFoot"].map((n) => `mixamorig:${n}`);
    const { map, missing } = buildRetargetMap(names);
    expect(missing).toEqual([]);
    expect(map.upperArmL).toBe("mixamorig:LeftArm");
    expect(map.lowerLegR).toBe("mixamorig:RightLeg");
  });
  it("reports missing bones for non-humanoid rigs", () => {
    expect(buildRetargetMap(["Root", "Tail1", "Tail2"]).missing.length).toBeGreaterThan(10);
  });
});

describe("motion prompt planner", () => {
  it("sequences presets in prompt order", () => {
    const plan = planMotion("Make my character walk towards the camera and wave");
    expect(plan.steps.map((s) => s.clip)).toEqual(["walking", "waving"]);
    expect(plan.note).toMatch(/not configured/);
  });
  it("prefers moonwalk over walking", () => {
    expect(planMotion("do a moonwalk").steps.map((s) => s.clip)).toEqual(["moonwalk"]);
  });
  it("falls back to idle and says so", () => {
    const p = planMotion("xyzzy");
    expect(p.unmatched).toBe(true);
    expect(p.steps[0].clip).toBe("idle");
  });
});

describe("animation library", () => {
  it("has every requested clip with finite poses", () => {
    expect(CLIPS.length).toBe(26);
    for (const c of CLIPS) for (const t of [0, 0.25, 0.5, 0.99]) {
      const p = c.pose(t);
      for (const e of Object.values(p.bones)) expect(e!.every(Number.isFinite)).toBe(true);
    }
  });
});

describe("GLB inspection", () => {
  it("rejects invalid files", () => {
    expect(inspectGlb(Buffer.from("not a glb file at all")).valid).toBe(false);
  });
});

describe("public demo privacy guard", () => {
  it("refuses the shared local studio on a public host unless overridden", async () => {
    const { isSharedPublicLocal } = await import("../src/server/config");
    const keys = ["VERCEL", "PERSONA3D_PUBLIC_DEMO", "PERSONA3D_ALLOW_SHARED_LOCAL"] as const;
    const saved = keys.map((k) => process.env[k]);
    try {
      delete process.env.VERCEL;
      delete process.env.PERSONA3D_PUBLIC_DEMO;
      expect(isSharedPublicLocal()).toBe(false);
      process.env.VERCEL = "1";
      expect(isSharedPublicLocal()).toBe(true);
      process.env.PERSONA3D_ALLOW_SHARED_LOCAL = "true";
      expect(isSharedPublicLocal()).toBe(false);
    } finally {
      keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    }
  });
});
