// Character library, CharacterExportService, VideoRenderingService and
// privacy / account-deletion operations.

import { db, newId, now } from "../db";
import { storage } from "../storage";
import { HttpError } from "../http";
import { freshStages } from "../jobs/pipeline";
import { startRunner } from "../jobs/runner";
import { defaultProviderId, getProvider } from "../providers/registry";
import type { CharacterRecord, CharacterView, ExportRecord, GenerationJobRecord, GenerationSettings } from "@/lib/types";

export async function ownedCharacter(userId: string, id: string) {
  const c = await db().get("characters", id);
  if (!c || c.user_id !== userId) throw new HttpError(404, "Character not found");
  return c;
}

const latest = (jobs: GenerationJobRecord[]) => jobs.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

export async function toView(c: CharacterRecord, jobs?: GenerationJobRecord[], animCount?: number): Promise<CharacterView> {
  const js = jobs ?? (await db().find("generation_jobs", { character_id: c.id }));
  const count = animCount ?? (await db().find("animations", { character_id: c.id })).length;
  return {
    ...c,
    model_signed_url: c.model_url ? await storage().signedUrl(c.model_url, 3600) : null,
    thumbnail_signed_url: c.thumbnail_url ? await storage().signedUrl(c.thumbnail_url, 3600) : null,
    animation_count: count,
    latest_job: latest(js),
  };
}

export const CharacterLibrary = {
  async list(userId: string) {
    const chars = await db().find("characters", { user_id: userId });
    const ids = chars.map((c) => c.id);
    const [jobs, anims] = await Promise.all([db().findIn("generation_jobs", "character_id", ids), db().findIn("animations", "character_id", ids)]);
    return Promise.all(
      chars
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((c) => toView(c, jobs.filter((j) => j.character_id === c.id), anims.filter((a) => a.character_id === c.id).length))
    );
  },

  async createDraft(userId: string, name: string) {
    const c: CharacterRecord = {
      id: newId(),
      user_id: userId,
      name: name.trim().slice(0, 80) || "Untitled character",
      style: "stylised",
      generation_status: "draft",
      model_url: null,
      thumbnail_url: null,
      texture_url: null,
      rig_status: "none",
      provider: null,
      settings: null,
      customisation: null,
      is_demo: false,
      created_at: now(),
      updated_at: now(),
    };
    return db().insert("characters", c);
  },

  async startGeneration(userId: string, id: string, settings: GenerationSettings, consent: boolean) {
    if (!consent) throw new HttpError(400, "Please confirm you have permission to process these photographs", "consent_required");
    const c = await ownedCharacter(userId, id);
    const photos = await db().find("character_photos", { character_id: id });
    if (!photos.length) throw new HttpError(400, "Upload at least one photograph first", "no_photos");
    const active = (await db().find("generation_jobs", { character_id: id })).find((j) => ["queued", "processing"].includes(j.job_status));
    if (active) throw new HttpError(409, "A generation is already running for this character", "job_active");
    const providerId = settings.provider || defaultProviderId();
    const bundle = getProvider(providerId);
    const isDemo = bundle.reconstruction.info().demo;
    await db().update("characters", id, {
      name: c.name,
      style: settings.style,
      settings: { ...settings, provider: providerId },
      provider: providerId,
      is_demo: isDemo,
      generation_status: "queued",
      rig_status: "none",
      updated_at: now(),
    });
    const job: GenerationJobRecord = {
      id: newId(),
      user_id: userId,
      character_id: id,
      provider: providerId,
      job_status: "queued",
      progress_stage: null,
      stages: freshStages(),
      provider_task_ids: {},
      error_message: null,
      cancel_requested: false,
      usage: { calls: 0 },
      meta: {},
      lease_until: null,
      created_at: now(),
      updated_at: now(),
      completed_at: null,
    };
    await db().insert("generation_jobs", job);
    startRunner();
    return job;
  },

  async duplicate(userId: string, id: string) {
    const c = await ownedCharacter(userId, id);
    if (!c.model_url) throw new HttpError(400, "Only generated characters can be duplicated");
    const copy: CharacterRecord = { ...c, id: newId(), name: `${c.name} (copy)`.slice(0, 80), created_at: now(), updated_at: now() };
    const from = `users/${userId}/characters/${c.id}`;
    const to = `users/${userId}/characters/${copy.id}`;
    const move = async (key: string | null) => {
      if (!key) return null;
      const nk = key.replace(from, to);
      await storage().put(nk, await storage().get(key), key.endsWith(".glb") ? "model/gltf-binary" : "image/png");
      return nk;
    };
    copy.model_url = await move(c.model_url);
    copy.thumbnail_url = await move(c.thumbnail_url);
    copy.texture_url = await move(c.texture_url);
    await db().insert("characters", copy);
    for (const a of await db().find("animations", { character_id: c.id }))
      await db().insert("animations", { ...a, id: newId(), character_id: copy.id, animation_url: await move(a.animation_url), created_at: now() });
    return copy;
  },

  async remove(userId: string, id: string) {
    const c = await ownedCharacter(userId, id);
    for (const j of await db().find("generation_jobs", { character_id: id }))
      if (["queued", "processing"].includes(j.job_status)) await db().update("generation_jobs", j.id, { cancel_requested: true });
    await storage().removePrefix(`users/${userId}/characters/${c.id}`);
    for (const t of ["character_photos", "animations", "exports", "generation_jobs"] as const) await db().removeWhere(t, { character_id: id });
    await db().remove("characters", id);
  },
};

/** CharacterExportService + VideoRenderingService: renders happen in the browser from the real scene; the server stores and signs them. */
export const CharacterExportService = {
  async save(userId: string, characterId: string, format: string, bytes: Uint8Array, contentType: string) {
    await ownedCharacter(userId, characterId);
    const ext = format.split("-")[0];
    const key = `users/${userId}/characters/${characterId}/exports/${Date.now()}-${format}.${ext}`;
    await storage().put(key, bytes, contentType);
    const row: ExportRecord = { id: newId(), character_id: characterId, export_format: format, file_url: key, created_at: now() };
    await db().insert("exports", row);
    return { ...row, signed_url: await storage().signedUrl(key, 3600, key.split("/").pop()) };
  },
  async list(userId: string, characterId: string) {
    await ownedCharacter(userId, characterId);
    const rows = (await db().find("exports", { character_id: characterId })).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Promise.all(rows.map(async (r) => ({ ...r, signed_url: await storage().signedUrl(r.file_url, 3600, r.file_url.split("/").pop()) })));
  },
};
export const VideoRenderingService = {
  formats: ["mp4", "webm"] as const,
  save: (userId: string, characterId: string, bytes: Uint8Array, mime: string, label: string) =>
    CharacterExportService.save(userId, characterId, `${mime.includes("mp4") ? "mp4" : "webm"}-${label}`, bytes, mime),
};

export const PrivacyService = {
  async deleteAllPhotos(userId: string) {
    const chars = await db().find("characters", { user_id: userId });
    const photos = await db().findIn("character_photos", "character_id", chars.map((c) => c.id));
    await storage().remove(photos.map((p) => p.image_url));
    for (const p of photos) await db().remove("character_photos", p.id);
    return photos.length;
  },
  async deleteAccountData(userId: string) {
    for (const c of await db().find("characters", { user_id: userId })) await CharacterLibrary.remove(userId, c.id);
    await storage().removePrefix(`users/${userId}`);
    await db().removeWhere("generation_jobs", { user_id: userId });
    await db().remove("users", userId);
  },
  /** Deletes source photos of completed characters older than the user's retention window. */
  async applyRetention(userId: string, days: number) {
    const cutoff = Date.now() - days * 86_400_000;
    const chars = await db().find("characters", { user_id: userId });
    const photos = await db().findIn("character_photos", "character_id", chars.filter((c) => c.generation_status === "completed").map((c) => c.id));
    const old = photos.filter((p) => new Date(p.created_at).getTime() < cutoff);
    await storage().remove(old.map((p) => p.image_url));
    for (const p of old) await db().remove("character_photos", p.id);
    return old.length;
  },
};
