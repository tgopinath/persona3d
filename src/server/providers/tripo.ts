// Tripo adapter — EXPERIMENTAL. Written against Tripo's v2 OpenAPI
// (POST /v2/openapi/upload, POST /v2/openapi/task with type
// "multiview_to_model" / "animate_rig", GET /v2/openapi/task/:id) but not yet
// verified end-to-end with a live key. Confirm request shapes, view ordering
// (front, left, back, right), pricing and licence before enabling in production.

import { config } from "../config";
import type { ProviderInfo } from "@/lib/types";
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

interface TripoTask {
  task_id: string;
  status: string; // queued | running | success | failed | cancelled | unknown | banned | expired
  progress?: number;
  output?: { model?: string; pbr_model?: string; rendered_image?: string };
}

const mapState = (s: string): TaskStatus["state"] =>
  s === "success" ? "succeeded" : s === "running" ? "running" : s === "queued" ? "queued" : s === "cancelled" ? "cancelled" : "failed";

export class TripoProvider implements ImageTo3DProvider, RiggingProvider {
  id = "tripo";
  info(): ProviderInfo {
    return {
      id: "tripo",
      name: "Tripo (experimental)",
      configured: !!config.tripoKey,
      demo: false,
      capabilities: ["multiview-to-model", "auto-rigging"],
      maxImages: 4,
      notes: "Experimental adapter — request shapes not yet verified against a live key.",
    };
  }
  private auth() {
    if (!config.tripoKey) throw new ProviderError("TRIPO_API_KEY is not configured");
    return { Authorization: `Bearer ${config.tripoKey}` };
  }
  private async json<T>(res: Response) {
    const body = (await res.json().catch(() => ({}))) as { code?: number; data?: T; message?: string };
    if (!res.ok || (body.code !== undefined && body.code !== 0)) throw new ProviderError(`Tripo ${res.status}: ${body.message ?? "request failed"}`, res.status >= 500, res.status);
    return body.data as T;
  }
  private async upload(data: Buffer, mime: string, usage: UsageSink) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)], { type: mime }), `view.${mime.split("/")[1]}`);
    const res = await providerFetch(`${config.tripoBase}/v2/openapi/upload`, { method: "POST", headers: this.auth(), body: form, retries: 1 }, usage);
    const d = await this.json<{ image_token: string }>(res);
    return { type: mime.split("/")[1] === "png" ? "png" : "jpg", file_token: d.image_token };
  }
  private async createTask(body: object, usage: UsageSink) {
    const res = await providerFetch(`${config.tripoBase}/v2/openapi/task`, { method: "POST", headers: { ...this.auth(), "Content-Type": "application/json" }, body: JSON.stringify(body), retries: 1 }, usage);
    return (await this.json<{ task_id: string }>(res)).task_id;
  }
  private async getTask(id: string, usage: UsageSink) {
    const res = await providerFetch(`${config.tripoBase}/v2/openapi/task/${id}`, { method: "GET", headers: this.auth() }, usage);
    return this.json<TripoTask>(res);
  }

  async startReconstruction(input: ReconstructionInput, usage: UsageSink) {
    const order = ["front", "left", "back", "right"] as const;
    const files = [];
    for (const angle of order) {
      const img = input.images.find((i) => i.angle === angle);
      files.push(img ? await this.upload(img.data, img.mime, usage) : {});
    }
    if (!input.images.some((i) => i.angle === "front")) throw new ProviderError("Tripo multiview requires a front photo");
    return { taskId: await this.createTask({ type: "multiview_to_model", files, texture: true, pbr: input.settings.preset !== "fast" }, usage) };
  }
  async pollReconstruction(taskId: string, usage: UsageSink): Promise<TaskStatus> {
    const t = await this.getTask(taskId, usage);
    return { state: mapState(t.status), progress: typeof t.progress === "number" ? t.progress : null };
  }
  async downloadReconstruction(taskId: string, _i: ReconstructionInput, usage: UsageSink): Promise<ReconstructionResult> {
    const t = await this.getTask(taskId, usage);
    const url = t.output?.pbr_model ?? t.output?.model;
    if (!url) throw new ProviderError("Tripo task finished without a model");
    return { glb: await downloadBuffer(url, usage), textures: [], texturedInSameTask: true };
  }
  async startRig(args: { reconstructionTaskId?: string }, usage: UsageSink) {
    if (!args.reconstructionTaskId) throw new ProviderError("Tripo rigging needs the original task id");
    return { taskId: await this.createTask({ type: "animate_rig", original_model_task_id: args.reconstructionTaskId, out_format: "glb" }, usage) };
  }
  async pollRig(taskId: string, usage: UsageSink) {
    return this.pollReconstruction(taskId, usage);
  }
  async downloadRig(taskId: string, usage: UsageSink): Promise<RigResult> {
    const t = await this.getTask(taskId, usage);
    if (!t.output?.model) throw new ProviderError("Tripo rig task finished without a model");
    return { glb: await downloadBuffer(t.output.model, usage), animations: [] };
  }
}
