// Generation pipeline. Each stage is persisted before and after it runs, so a
// job survives browser refreshes and server restarts, and a failed stage can be
// retried without repeating completed ones. Progress is only ever what the
// provider reports — never invented.

import { config } from "../config";
import { db, now } from "../db";
import { getProvider } from "../providers/registry";
import type { ProviderBundle, TaskStatus, UsageSink } from "../providers/types";
import {
  AnimationGenerationService,
  CharacterGenerationService,
  CharacterRiggingService,
  MeshOptimizationService,
  TextureGenerationService,
} from "../services/generation";
import { ImageValidationService, MultiViewAnalysisService } from "../services/images";
import { STAGES, type CharacterRecord, type GenerationJobRecord, type StageId, type StageRecord } from "@/lib/types";

export class CancelledError extends Error {}

export const freshStages = () => Object.fromEntries(STAGES.map((s) => [s.id, { state: "pending" } as StageRecord])) as Record<StageId, StageRecord>;

export interface StageContext {
  job: GenerationJobRecord;
  character: CharacterRecord;
  bundle: ProviderBundle;
  usage: UsageSink;
  setProgress(progress: number | null, note?: string): Promise<void>;
  setTask(key: string, id: string): Promise<void>;
  setMeta(patch: Record<string, unknown>): Promise<void>;
  updateCharacter(patch: Partial<CharacterRecord>): Promise<void>;
  checkCancelled(): Promise<void>;
  /** Poll a provider task until it finishes, reporting real progress. */
  waitFor(poll: () => Promise<TaskStatus>, timeoutMs?: number): Promise<TaskStatus>;
}

type StageResult = { state: "done" | "skipped"; note?: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STAGE_FNS: Record<StageId, (ctx: StageContext) => Promise<StageResult>> = {
  async analyse(ctx) {
    const inputs = await MultiViewAnalysisService.loadInputs(ctx.character.id);
    if (!inputs.length) throw new Error("No photographs were uploaded for this character.");
    for (const i of inputs) ImageValidationService.validate(i.data);
    const max = ctx.bundle.reconstruction.info().maxImages;
    const used = Math.min(max, inputs.length);
    return {
      state: "done",
      note: `${inputs.length} photograph${inputs.length > 1 ? "s" : ""} validated${inputs.length > max ? ` — provider accepts ${max}, using the ${used} most informative angles` : ""}`,
    };
  },
  async appearance(ctx) {
    const prompt = MultiViewAnalysisService.texturePrompt(ctx.character.settings!);
    await ctx.setMeta({ texturePrompt: prompt });
    const a = ctx.character.settings!.appearance ?? {};
    const sampled = Object.keys(a).length;
    return {
      state: "done",
      note: ctx.bundle.reconstruction.info().demo
        ? `${sampled} colour regions sampled from your photos`
        : "Style and texture guidance prepared for the provider",
    };
  },
  geometry: (ctx) => CharacterGenerationService.reconstruct(ctx),
  texture: (ctx) => TextureGenerationService.run(ctx),
  async rig(ctx) {
    await MeshOptimizationService.check(ctx);
    return CharacterRiggingService.run(ctx);
  },
  animations: (ctx) => AnimationGenerationService.register(ctx),
  async finalise(ctx) {
    await ctx.updateCharacter({ generation_status: "completed" });
    return { state: "done", note: "Saved to your library" };
  },
};

async function save(jobId: string, patch: Partial<GenerationJobRecord>) {
  return (await db().update("generation_jobs", jobId, { ...patch, updated_at: now() }))!;
}

export async function runJob(jobId: string): Promise<void> {
  let job = await db().get("generation_jobs", jobId);
  if (!job) return;
  let bundle: ProviderBundle;
  try {
    bundle = getProvider(job.provider);
  } catch (e) {
    await save(jobId, { job_status: "failed", error_message: (e as Error).message, lease_until: null });
    await db().update("characters", job.character_id, { generation_status: "failed", updated_at: now() });
    return;
  }

  const usage = { calls: job.usage?.calls ?? 0, credits: job.usage?.credits ?? 0 };
  const sink: UsageSink = { call: () => void usage.calls++, credits: (n) => void (usage.credits = n) };

  for (;;) {
    job = (await db().get("generation_jobs", jobId))!;
    const character = await db().get("characters", job.character_id);
    if (!character) return;

    if (job.cancel_requested) {
      const geoTask = job.provider_task_ids.geometry;
      if (geoTask && job.stages.geometry.state === "running") await bundle.reconstruction.cancel?.(geoTask, sink).catch(() => undefined);
      const stages = { ...job.stages };
      for (const s of STAGES) if (stages[s.id].state === "running") stages[s.id] = { ...stages[s.id], state: "pending", note: "Cancelled" };
      await save(jobId, { job_status: "cancelled", stages, lease_until: null, usage });
      await db().update("characters", character.id, { generation_status: "cancelled", updated_at: now() });
      return;
    }

    const next = STAGES.find((s) => ["pending", "running"].includes(job!.stages[s.id].state));
    if (!next) {
      await save(jobId, { job_status: "completed", completed_at: now(), lease_until: null, usage });
      return;
    }

    const stageId = next.id;
    const stages = { ...job.stages, [stageId]: { ...job.stages[stageId], state: "running", startedAt: job.stages[stageId].startedAt ?? now(), error: undefined } };
    job = await save(jobId, { job_status: "processing", progress_stage: stageId, stages });
    if (character.generation_status !== "processing") await db().update("characters", character.id, { generation_status: "processing", updated_at: now() });

    const ctx: StageContext = {
      job,
      character,
      bundle,
      usage: sink,
      async setProgress(progress, note) {
        const cur = (await db().get("generation_jobs", jobId))!;
        await save(jobId, { stages: { ...cur.stages, [stageId]: { ...cur.stages[stageId], progress, note: note ?? cur.stages[stageId].note } }, usage });
      },
      async setTask(key, id) {
        const cur = (await db().get("generation_jobs", jobId))!;
        ctx.job = await save(jobId, { provider_task_ids: { ...cur.provider_task_ids, [key]: id } });
      },
      async setMeta(patch) {
        const cur = (await db().get("generation_jobs", jobId))!;
        ctx.job = await save(jobId, { meta: { ...cur.meta, ...patch } });
      },
      async updateCharacter(patch) {
        ctx.character = (await db().update("characters", character.id, { ...patch, updated_at: now() }))!;
      },
      async checkCancelled() {
        const cur = await db().get("generation_jobs", jobId);
        if (!cur || cur.cancel_requested) throw new CancelledError();
      },
      async waitFor(poll, timeoutMs = 30 * 60_000) {
        const start = Date.now();
        for (;;) {
          await ctx.checkCancelled();
          const st = await poll();
          if (st.credits) sink.credits(st.credits);
          if (st.state === "succeeded" || st.state === "failed" || st.state === "cancelled") return st;
          await ctx.setProgress(st.progress, st.state === "queued" ? "Queued at provider" : st.progress === null ? "Running at provider (no progress reported)" : undefined);
          if (Date.now() - start > timeoutMs) throw new Error("Generation timed out at the provider. You can retry this stage.");
          await sleep(4000);
        }
      },
    };

    try {
      if (bundle.reconstruction.info().demo && config.demoStageDelayMs > 0) await sleep(config.demoStageDelayMs);
      const result = await STAGE_FNS[stageId](ctx);
      const cur = (await db().get("generation_jobs", jobId))!;
      await save(jobId, {
        stages: { ...cur.stages, [stageId]: { ...cur.stages[stageId], state: result.state, note: result.note ?? cur.stages[stageId].note, finishedAt: now() } },
        usage,
      });
    } catch (e) {
      if (e instanceof CancelledError) continue; // handled at loop top
      const msg = e instanceof Error ? e.message : String(e);
      const cur = (await db().get("generation_jobs", jobId))!;
      await save(jobId, {
        job_status: "failed",
        error_message: `${next.label} failed: ${msg}`,
        stages: { ...cur.stages, [stageId]: { ...cur.stages[stageId], state: "failed", error: msg, finishedAt: now() } },
        lease_until: null,
        usage,
      });
      await db().update("characters", character.id, { generation_status: "failed", updated_at: now() });
      return;
    }
  }
}

/** Reset a failed/cancelled job so it resumes from the first incomplete stage. */
export async function retryJob(job: GenerationJobRecord, fromStage?: StageId) {
  const idx = fromStage ? STAGES.findIndex((s) => s.id === fromStage) : STAGES.findIndex((s) => !["done", "skipped"].includes(job.stages[s.id].state));
  const stages = { ...job.stages };
  const taskIds = { ...job.provider_task_ids };
  STAGES.forEach((s, i) => {
    if (i >= idx) {
      stages[s.id] = { state: "pending" };
      // A failed provider task can't be resumed; start a fresh one.
      if (job.stages[s.id].state === "failed" || fromStage) delete taskIds[s.id];
    }
  });
  await db().update("characters", job.character_id, { generation_status: "queued", updated_at: now() });
  return save(job.id, { job_status: "queued", stages, provider_task_ids: taskIds, error_message: null, cancel_requested: false, lease_until: null, completed_at: null });
}
