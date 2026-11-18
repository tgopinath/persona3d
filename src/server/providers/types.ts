// Common interfaces every AI provider adapter implements. The pipeline only
// talks to these, so providers can be swapped without touching the app.

import type { Angle, GenerationSettings, ProviderInfo } from "@/lib/types";

export interface InputImage {
  angle: Angle;
  mime: string;
  data: Buffer;
}

export interface ReconstructionInput {
  images: InputImage[];
  settings: GenerationSettings;
  /** Optional text guidance for texturing (built from description + style). */
  texturePrompt: string;
}

export type TaskState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface TaskStatus {
  state: TaskState;
  /** Provider-reported 0–100, or null when the provider only reports state. */
  progress: number | null;
  error?: string;
  credits?: number;
  raw?: unknown;
}

export interface ReconstructionResult {
  glb: Buffer;
  thumbnail?: { data: Buffer; mime: string };
  textures: { name: string; data: Buffer; mime: string }[];
  /** True when geometry and textures came from the same provider task. */
  texturedInSameTask: boolean;
}

export interface RigResult {
  glb: Buffer;
  animations: { name: string; glb: Buffer }[];
}

export interface UsageSink {
  call(): void;
  credits(n: number): void;
}

export interface BaseProvider {
  id: string;
  info(): ProviderInfo;
}

/** Single- or multi-view image to textured 3D model. */
export interface ImageTo3DProvider extends BaseProvider {
  startReconstruction(input: ReconstructionInput, usage: UsageSink): Promise<{ taskId: string }>;
  pollReconstruction(taskId: string, usage: UsageSink): Promise<TaskStatus>;
  downloadReconstruction(taskId: string, input: ReconstructionInput, usage: UsageSink): Promise<ReconstructionResult>;
  cancel?(taskId: string, usage: UsageSink): Promise<void>;
}

export type MultiViewReconstructionProvider = ImageTo3DProvider;

export interface TextureProvider extends BaseProvider {
  startRetexture(modelTaskId: string, prompt: string, usage: UsageSink): Promise<{ taskId: string }>;
  pollRetexture(taskId: string, usage: UsageSink): Promise<TaskStatus>;
}

export interface RiggingProvider extends BaseProvider {
  startRig(args: { reconstructionTaskId?: string; modelUrl?: string; heightMeters: number }, usage: UsageSink): Promise<{ taskId: string }>;
  pollRig(taskId: string, usage: UsageSink): Promise<TaskStatus>;
  downloadRig(taskId: string, usage: UsageSink): Promise<RigResult>;
}

export interface MotionGenerationProvider extends BaseProvider {
  /** Returns a GLB containing one animation for the given rig task. */
  textToMotion(args: { rigTaskId: string; prompt: string }, usage: UsageSink): Promise<{ taskId: string }>;
  pollMotion(taskId: string, usage: UsageSink): Promise<TaskStatus>;
  downloadMotion(taskId: string, usage: UsageSink): Promise<{ name: string; glb: Buffer }>;
}

export interface ProviderBundle {
  reconstruction: ImageTo3DProvider;
  rigging?: RiggingProvider;
  texture?: TextureProvider;
  motion?: MotionGenerationProvider;
}

export class ProviderError extends Error {
  constructor(message: string, public retryable = false, public status?: number) {
    super(message);
  }
}

/** fetch with timeout + retries on network errors, 429 and 5xx. */
export async function providerFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number; retries?: number },
  usage?: UsageSink
): Promise<Response> {
  const retries = init.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 60_000);
    try {
      usage?.call();
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new ProviderError(`Provider responded ${res.status}`, true, res.status);
      } else return res;
    } catch (e) {
      lastErr = new ProviderError(e instanceof Error && e.name === "AbortError" ? "Provider request timed out" : `Network error: ${(e as Error).message}`, true);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastErr;
}

export async function downloadBuffer(url: string, usage?: UsageSink) {
  const res = await providerFetch(url, { method: "GET", timeoutMs: 180_000 }, usage);
  if (!res.ok) throw new ProviderError(`Download failed (${res.status})`, res.status >= 500);
  return Buffer.from(await res.arrayBuffer());
}
