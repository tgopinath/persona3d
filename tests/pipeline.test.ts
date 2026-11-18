import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makePng } from "./helpers";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "persona3d-test-"));
process.env.PERSONA3D_DATA_DIR = dir;
process.env.PERSONA3D_DEMO_STAGE_DELAY_MS = "0";
process.env.NEXT_PUBLIC_SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

type Mods = {
  db: typeof import("@/server/db");
  storage: typeof import("@/server/storage");
  chars: typeof import("@/server/services/characters");
  images: typeof import("@/server/services/images");
  pipeline: typeof import("@/server/jobs/pipeline");
  http: typeof import("@/server/http");
  glb: typeof import("@/lib/glbInspect");
};
let m: Mods;

const settings = {
  style: "cartoon", realism: "cartoon", characterType: "full_body", bodyType: "athletic",
  proportions: { height: 1, shoulders: 1, hips: 1, limbs: 1, head: 1 },
  preserve: { hairstyle: true, facialHair: true, glasses: true, accessories: true, clothing: true },
  description: "wears glasses", preset: "fast", meshQuality: "medium", textureResolution: 1024,
  removeBackground: true, faceDetail: "standard", bodyDetail: "standard", provider: "demo",
  appearance: { skin: "#c58c66", hair: "#1b120d", top: "#2f6fe0", bottom: "#222833" },
} as const;

beforeAll(async () => {
  m = {
    db: await import("@/server/db"),
    storage: await import("@/server/storage"),
    chars: await import("@/server/services/characters"),
    images: await import("@/server/services/images"),
    pipeline: await import("@/server/jobs/pipeline"),
    http: await import("@/server/http"),
    glb: await import("@/lib/glbInspect"),
  };
});

describe("generation pipeline (demo provider)", () => {
  it("validates uploads server-side", async () => {
    const user = await m.http.requireUser(new Request("http://x"));
    const c = await m.chars.CharacterLibrary.createDraft(user.id, "Val");
    await expect(m.images.ImageUploadService.upload(user.id, c.id, "front", makePng(100, 100), "")).rejects.toThrow(/at least 384px/);
    await expect(m.images.ImageUploadService.upload(user.id, c.id, "front", Buffer.from("GIF89a....."), "")).rejects.toThrow(/Unsupported/);
  });

  it("requires consent and photos before generating", async () => {
    const user = await m.http.requireUser(new Request("http://x"));
    const c = await m.chars.CharacterLibrary.createDraft(user.id, "NoPhotos");
    await expect(m.chars.CharacterLibrary.startGeneration(user.id, c.id, settings as never, false)).rejects.toThrow(/permission/);
    await expect(m.chars.CharacterLibrary.startGeneration(user.id, c.id, settings as never, true)).rejects.toThrow(/at least one photograph/);
  });

  it("runs every stage and produces a rigged, animated GLB", async () => {
    const user = await m.http.requireUser(new Request("http://x"));
    const c = await m.chars.CharacterLibrary.createDraft(user.id, "Test Hero");
    await m.images.ImageUploadService.upload(user.id, c.id, "front", makePng(512, 640), "good:80");
    await m.images.ImageUploadService.upload(user.id, c.id, "left", makePng(512, 640), "good:75");
    const job = await m.chars.CharacterLibrary.startGeneration(user.id, c.id, settings as never, true);
    await m.pipeline.runJob(job.id);

    const done = (await m.db.db().get("generation_jobs", job.id))!;
    expect(done.error_message).toBeNull();
    expect(done.job_status).toBe("completed");
    expect(Object.values(done.stages).every((s) => s.state === "done" || s.state === "skipped")).toBe(true);

    const ch = (await m.db.db().get("characters", c.id))!;
    expect(ch.generation_status).toBe("completed");
    expect(ch.rig_status).toBe("rigged");
    expect(ch.is_demo).toBe(true);
    const report = m.glb.inspectGlb(await m.storage.storage().get(ch.model_url!));
    expect(report.humanoid).toBe(true);
    expect(report.animations.length).toBe(26);
    expect(report.morphTargets).toEqual(expect.arrayContaining(["blink", "smile"]));
    expect(report.accessories).toContain("glasses");
    const anims = await m.db.db().find("animations", { character_id: c.id });
    expect(anims.length).toBe(26);
  });

  it("supports cancel and retry from a stage", async () => {
    const user = await m.http.requireUser(new Request("http://x"));
    const c = await m.chars.CharacterLibrary.createDraft(user.id, "Cancel me");
    await m.images.ImageUploadService.upload(user.id, c.id, "front", makePng(512, 512), "");
    const job = await m.chars.CharacterLibrary.startGeneration(user.id, c.id, settings as never, true);
    await m.db.db().update("generation_jobs", job.id, { cancel_requested: true });
    await m.pipeline.runJob(job.id);
    const cancelled = (await m.db.db().get("generation_jobs", job.id))!;
    expect(cancelled.job_status).toBe("cancelled");
    await m.pipeline.retryJob(cancelled);
    await m.pipeline.runJob(job.id);
    expect((await m.db.db().get("generation_jobs", job.id))!.job_status).toBe("completed");
  });

  it("duplicates and deletes characters with their files", async () => {
    const user = await m.http.requireUser(new Request("http://x"));
    const list = await m.chars.CharacterLibrary.list(user.id);
    const done = list.find((x) => x.name === "Test Hero")!;
    const copy = await m.chars.CharacterLibrary.duplicate(user.id, done.id);
    expect((await m.db.db().find("animations", { character_id: copy.id })).length).toBe(26);
    await m.chars.CharacterLibrary.remove(user.id, copy.id);
    expect(await m.db.db().get("characters", copy.id)).toBeNull();
    await expect(m.storage.storage().get(copy.model_url!)).rejects.toThrow();
  });

  it("signs and verifies local file URLs", async () => {
    const url = await m.storage.storage().signedUrl("users/a/b.png", 60);
    const u = new URL(url, "http://x");
    const exp = Number(u.searchParams.get("exp"));
    expect(u.searchParams.get("sig")).toBe(m.storage.signLocal("users/a/b.png", exp));
    await expect(m.storage.storage().signedUrl("../etc/passwd")).rejects.toThrow(/Invalid storage key/);
  });
});
