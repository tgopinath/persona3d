// Meshy adapter (https://docs.meshy.ai). Verified against the public docs on
// 2026-11-18:
//   POST /openapi/v1/multi-image-to-3d   image_urls: 1–4 public URLs or data URIs
//   GET  /openapi/v1/multi-image-to-3d/:id  status PENDING|IN_PROGRESS|SUCCEEDED|FAILED|CANCELED, progress 0–100
//   DELETE /openapi/v1/multi-image-to-3d/:id (409 while IN_PROGRESS)
//   POST /openapi/v1/rigging  { input_task_id | model_url, height_meters }  humanoid only, ≤380k tris, textured GLB
//   GET  /openapi/v1/rigging/:id  result.rigged_character_glb_url, result.basic_animations.{walking,running}_glb_url
// Re-check pricing, limits and licence terms before production use.

import { config } from "../config";
import type { Angle, ProviderInfo } from "@/lib/types";
import {
  downloadBuffer,
  ProviderError,
  providerFetch,
  type ImageTo3DProvider,
  type ReconstructionInput,
  type ReconstructionResult,
  type RigResult,
  type RiggingProvider,
  type TaskStatus,
  type UsageSink,
} from "./types";

// Meshy accepts at most 4 views; prefer the most informative angles.
const ANGLE_PRIORITY: Angle[] = ["front", "three_quarter_left", "three_quarter_right", "left", "right", "back"];

const mapState = (s: string): TaskStatus["state"] =>
  s === "SUCCEEDED" ? "succeeded" : s === "FAILED" ? "failed" : s === "CANCELED" ? "cancelled" : s === "IN_PROGRESS" ? "running" : "queued";

interface MeshyTask {
  id: string;
  status: string;
  progress?: number;
  model_urls?: Record<string, string>;
  thumbnail_url?: string;
  texture_urls?: Record<string, string>[];
  task_error?: { message?: string };
  consumed_credits?: number;
  result?: {
    rigged_character_glb_url?: string;
    basic_animations?: Record<string, string>;
  };
}

export class MeshyProvider implements ImageTo3DProvider, RiggingProvider {
  id = "meshy";
  private cache = new Map<string, MeshyTask>();

  info(): ProviderInfo {
    return {
      id: "meshy",
      name: "Meshy",
      configured: !!config.meshyKey,
      demo: false,
      capabilities: ["multi-image-to-3d", "pbr-textures", "auto-rigging", "basic-animations"],
      maxImages: 4,
      notes: "Multi-view reconstruction (up to 4 views) with textures in one task, then humanoid auto-rigging with walking/running clips. Billed in Meshy credits.",
    };
  }

  private headers() {
    if (!config.meshyKey) throw new ProviderError("MESHY_API_KEY is not configured");
    return { Authorization: `Bearer ${config.meshyKey}`, "Content-Type": "application/json" };
  }

  private async json<T>(res: Response): Promise<T> {
    const body = await res.text();
    if (!res.ok) {
      let msg = body;
      try {
        msg = JSON.parse(body).message ?? body;
      } catch {}
      throw new ProviderError(`Meshy ${res.status}: ${msg.slice(0, 300)}`, res.status >= 500, res.status);
    }
    return JSON.parse(body) as T;
  }

  async startReconstruction(input: ReconstructionInput, usage: UsageSink) {
    const images = [...input.images]
      .sort((a, b) => ANGLE_PRIORITY.indexOf(a.angle) - ANGLE_PRIORITY.indexOf(b.angle))
      .slice(0, 4)
      .map((i) => `data:${i.mime};base64,${i.data.toString("base64")}`);
    const s = input.settings;
    const body = {
      image_urls: images,
      should_texture: true,
      enable_pbr: s.preset !== "fast",
      geometry_resolution: s.meshQuality === "high" ? "2k" : "standard",
      texture_prompt: input.texturePrompt.slice(0, 600) || undefined,
      target_formats: ["glb"],
    };
    const res = await providerFetch(`${config.meshyBase}/openapi/v1/multi-image-to-3d`, { method: "POST", headers: this.headers(), body: JSON.stringify(body), retries: 1 }, usage);
    const data = await this.json<{ result: string }>(res);
    return { taskId: data.result };
  }

  private async getTask(kind: "multi-image-to-3d" | "rigging", id: string, usage: UsageSink) {
    const res = await providerFetch(`${config.meshyBase}/openapi/v1/${kind}/${id}`, { method: "GET", headers: this.headers() }, usage);
    const t = await this.json<MeshyTask>(res);
    this.cache.set(`${kind}:${id}`, t);
    return t;
  }

  private status(t: MeshyTask): TaskStatus {
    return {
      state: mapState(t.status),
      progress: typeof t.progress === "number" ? t.progress : null,
      error: t.task_error?.message || undefined,
      credits: t.consumed_credits,
    };
  }

  async pollReconstruction(taskId: string, usage: UsageSink) {
    return this.status(await this.getTask("multi-image-to-3d", taskId, usage));
  }

  async downloadReconstruction(taskId: string, _input: ReconstructionInput, usage: UsageSink): Promise<ReconstructionResult> {
    const t = this.cache.get(`multi-image-to-3d:${taskId}`) ?? (await this.getTask("multi-image-to-3d", taskId, usage));
    const glbUrl = t.model_urls?.glb;
    if (!glbUrl) throw new ProviderError("Meshy task finished without a GLB model");
    const glb = await downloadBuffer(glbUrl, usage);
    const thumbnail = t.thumbnail_url ? { data: await downloadBuffer(t.thumbnail_url, usage).catch(() => Buffer.alloc(0)), mime: "image/png" } : undefined;
    const textures: ReconstructionResult["textures"] = [];
    const base = t.texture_urls?.[0]?.base_color;
    if (base) textures.push({ name: "base_color.png", data: await downloadBuffer(base, usage), mime: "image/png" });
    return { glb, thumbnail: thumbnail?.data.length ? thumbnail : undefined, textures, texturedInSameTask: true };
  }

  async cancel(taskId: string, usage: UsageSink) {
    // DELETE returns 409 while IN_PROGRESS; in that case we simply stop polling.
    await providerFetch(`${config.meshyBase}/openapi/v1/multi-image-to-3d/${taskId}`, { method: "DELETE", headers: this.headers(), retries: 0 }, usage).catch(() => undefined);
  }

  async startRig(args: { reconstructionTaskId?: string; modelUrl?: string; heightMeters: number }, usage: UsageSink) {
    const body = args.reconstructionTaskId ? { input_task_id: args.reconstructionTaskId, height_meters: args.heightMeters } : { model_url: args.modelUrl, height_meters: args.heightMeters };
    const res = await providerFetch(`${config.meshyBase}/openapi/v1/rigging`, { method: "POST", headers: this.headers(), body: JSON.stringify(body), retries: 1 }, usage);
    const data = await this.json<{ result: string }>(res);
    return { taskId: data.result };
  }

  async pollRig(taskId: string, usage: UsageSink) {
    return this.status(await this.getTask("rigging", taskId, usage));
  }

  async downloadRig(taskId: string, usage: UsageSink): Promise<RigResult> {
    const t = this.cache.get(`rigging:${taskId}`) ?? (await this.getTask("rigging", taskId, usage));
    const url = t.result?.rigged_character_glb_url;
    if (!url) throw new ProviderError("Meshy rigging finished without a rigged GLB");
    const glb = await downloadBuffer(url, usage);
    const animations: RigResult["animations"] = [];
    const ba = t.result?.basic_animations ?? {};
    for (const [name, key] of [["walking", "walking_glb_url"], ["running", "running_glb_url"]] as const) {
      if (ba[key]) animations.push({ name, glb: await downloadBuffer(ba[key], usage) });
    }
    return { glb, animations };
  }
}
