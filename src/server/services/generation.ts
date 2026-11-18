// CharacterGenerationService, TextureGenerationService, MeshOptimizationService,
// CharacterRiggingService and AnimationGenerationService.

import { db, newId, now } from "../db";
import { storage } from "../storage";
import { inspectGlb } from "@/lib/glbInspect";
import { CLIPS } from "@/lib/animation/library";
import type { StageContext } from "../jobs/pipeline";
import { MultiViewAnalysisService } from "./images";
import type { AnimationRecord } from "@/lib/types";

const prefix = (ctx: StageContext) => `users/${ctx.character.user_id}/characters/${ctx.character.id}`;
const RAW = (ctx: StageContext) => `${prefix(ctx)}/model_raw.glb`;
const FINAL = (ctx: StageContext) => `${prefix(ctx)}/model.glb`;

export const CharacterGenerationService = {
  /** Reconstruct geometry (and textures, where the provider does both in one task). */
  async reconstruct(ctx: StageContext) {
    const p = ctx.bundle.reconstruction;
    const input = {
      images: await MultiViewAnalysisService.loadInputs(ctx.character.id),
      settings: ctx.character.settings!,
      texturePrompt: (ctx.job.meta.texturePrompt as string) ?? MultiViewAnalysisService.texturePrompt(ctx.character.settings!),
    };
    let taskId = ctx.job.provider_task_ids.geometry;
    if (!taskId) {
      ({ taskId } = await p.startReconstruction(input, ctx.usage));
      await ctx.setTask("geometry", taskId);
    }
    const st = await ctx.waitFor(() => p.pollReconstruction(taskId, ctx.usage));
    if (st.state !== "succeeded") throw new Error(st.error || `Provider reported ${st.state}`);
    const result = await p.downloadReconstruction(taskId, input, ctx.usage);

    const report = inspectGlb(result.glb);
    if (!report.valid) throw new Error(`Provider returned an invalid GLB: ${report.error}`);

    await storage().put(RAW(ctx), result.glb, "model/gltf-binary");
    const patch: Record<string, string> = {};
    if (result.thumbnail) patch.thumbnail_url = await storage().put(`${prefix(ctx)}/thumbnail.png`, result.thumbnail.data, result.thumbnail.mime);
    if (result.textures[0]) patch.texture_url = await storage().put(`${prefix(ctx)}/textures/${result.textures[0].name}`, result.textures[0].data, result.textures[0].mime);
    // Keep completed work: the model is viewable even if a later stage fails.
    await ctx.updateCharacter({ model_url: RAW(ctx), ...patch });
    await ctx.setMeta({ texturedInSameTask: result.texturedInSameTask, triangles: report.triangles, textureCount: report.textures });
    return { state: "done" as const, note: `${report.meshes} mesh${report.meshes > 1 ? "es" : ""}, ${report.triangles.toLocaleString()} triangles` };
  },
};

export const TextureGenerationService = {
  async run(ctx: StageContext) {
    if (ctx.bundle.reconstruction.info().demo)
      return { state: "done" as const, note: "Demo uses solid PBR materials tinted from your photos — no image textures" };
    if (ctx.job.meta.texturedInSameTask)
      return { state: "done" as const, note: `Included in the reconstruction task (${ctx.job.meta.textureCount ?? 0} texture maps)` };
    if (!ctx.bundle.texture) return { state: "skipped" as const, note: "Provider has no separate texturing step" };
    const { taskId } = await ctx.bundle.texture.startRetexture(ctx.job.provider_task_ids.geometry, (ctx.job.meta.texturePrompt as string) ?? "", ctx.usage);
    await ctx.setTask("texture", taskId);
    const st = await ctx.waitFor(() => ctx.bundle.texture!.pollRetexture(taskId, ctx.usage));
    if (st.state !== "succeeded") throw new Error(st.error || `Texturing ${st.state}`);
    return { state: "done" as const };
  },
};

export const MAX_RIG_TRIANGLES = 380_000;

export const MeshOptimizationService = {
  /**
   * Validates the mesh is suitable for rigging. Decimation/remeshing needs the
   * Blender worker (see README, "Provider evaluation"), which is not bundled; we report
   * the limit honestly instead of pretending to optimise.
   */
  async check(ctx: StageContext) {
    const tris = Number(ctx.job.meta.triangles ?? 0);
    if (tris > MAX_RIG_TRIANGLES && !inspectGlb(await storage().get(RAW(ctx))).humanoid)
      throw new Error(`Mesh has ${tris.toLocaleString()} triangles; auto-rigging supports up to ${MAX_RIG_TRIANGLES.toLocaleString()}. Regenerate with lower mesh quality, or configure the Blender worker for decimation.`);
  },
};

export const CharacterRiggingService = {
  async run(ctx: StageContext) {
    const raw = await storage().get(RAW(ctx));
    const report = inspectGlb(raw);
    if (report.humanoid) {
      await storage().put(FINAL(ctx), raw, "model/gltf-binary");
      await ctx.updateCharacter({ model_url: FINAL(ctx), rig_status: "rigged" });
      return { state: "done" as const, note: `Humanoid skeleton validated — ${report.joints.length} joints` };
    }
    const rigger = ctx.bundle.rigging;
    if (!rigger) {
      await ctx.updateCharacter({ rig_status: "unsupported" });
      return { state: "skipped" as const, note: "No rigging provider configured — the model is viewable but cannot be animated" };
    }
    await ctx.updateCharacter({ rig_status: "pending" });
    try {
      let taskId = ctx.job.provider_task_ids.rig;
      if (!taskId) {
        ({ taskId } = await rigger.startRig({ reconstructionTaskId: ctx.job.provider_task_ids.geometry, heightMeters: 1.7 }, ctx.usage));
        await ctx.setTask("rig", taskId);
      }
      const st = await ctx.waitFor(() => rigger.pollRig(taskId, ctx.usage));
      if (st.state !== "succeeded") throw new Error(st.error || `Rigging ${st.state}`);
      const rig = await rigger.downloadRig(taskId, ctx.usage);
      const rr = inspectGlb(rig.glb);
      if (!rr.valid || !rr.skins) throw new Error("Rigging provider returned a model without a skeleton");
      await storage().put(FINAL(ctx), rig.glb, "model/gltf-binary");
      const anims: string[] = [];
      for (const a of rig.animations) {
        await storage().put(`${prefix(ctx)}/animations/${a.name}.glb`, a.glb, "model/gltf-binary");
        anims.push(a.name);
      }
      await ctx.setMeta({ providerAnimations: anims });
      await ctx.updateCharacter({ model_url: FINAL(ctx), rig_status: "rigged" });
      return {
        state: "done" as const,
        note: rr.humanoid ? `Rigged — ${rr.joints.length} joints` : `Rigged with non-standard bone names (${rr.missingBones.length} unmapped) — procedural animations may not apply`,
      };
    } catch (e) {
      await ctx.updateCharacter({ rig_status: "failed" });
      throw e;
    }
  },
};

export const AnimationGenerationService = {
  async register(ctx: StageContext) {
    const c = ctx.character;
    await db().removeWhere("animations", { character_id: c.id });
    if (c.rig_status !== "rigged") return { state: "skipped" as const, note: "Animations need a rigged model" };
    const model = await storage().get(c.model_url!);
    const report = inspectGlb(model);
    const rows: AnimationRecord[] = [];
    const add = (name: string, duration: number, source: AnimationRecord["source"], url: string | null = null) =>
      rows.push({ id: newId(), character_id: c.id, animation_name: name, animation_url: url, duration, source, created_at: now() });

    for (const a of report.animations) add(a.name, a.duration, "embedded");
    for (const name of (ctx.job.meta.providerAnimations as string[]) ?? [])
      add(name, 0, "provider", `users/${c.user_id}/characters/${c.id}/animations/${name}.glb`);
    if (report.humanoid) {
      const have = new Set(rows.map((r) => r.animation_name));
      for (const clip of CLIPS) if (!have.has(clip.id)) add(clip.id, clip.duration, "procedural");
    }
    for (const r of rows) await db().insert("animations", r);
    const counts = rows.reduce<Record<string, number>>((m, r) => ((m[r.source] = (m[r.source] ?? 0) + 1), m), {});
    return {
      state: "done" as const,
      note: Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ") || "No compatible animations",
    };
  },
};
