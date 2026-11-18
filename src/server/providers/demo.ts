// Demo provider: runs entirely on this server with no API key.
// It does NOT reconstruct the person from their photos. It builds a parametric,
// fully rigged character whose colours are sampled from the photos and whose
// proportions follow the chosen style/body settings. The UI labels it as such.

import { buildDemoCharacter, type AccessoryId } from "@/lib/character/demoCharacter";
import { inspectRig, sampleAll } from "@/lib/animation/clips";
import { exportGLB } from "@/lib/character/exportGlb";
import type { GenerationSettings, Proportions, ProviderInfo } from "@/lib/types";
import type { ImageTo3DProvider, ReconstructionInput, ReconstructionResult, TaskStatus } from "./types";

export function proportionsFor(settings: GenerationSettings): Proportions {
  const base = { height: 1, shoulders: 1, hips: 1, limbs: 1, head: 1 };
  switch (settings.bodyType) {
    case "slim":
      return { ...base, shoulders: 0.9, hips: 0.9, limbs: 1.02 };
    case "athletic":
      return { ...base, shoulders: 1.15, hips: 0.96, height: 1.02 };
    case "custom":
      return { ...base, ...settings.proportions };
    default:
      return base;
  }
}

export function demoParamsFromSettings(settings: GenerationSettings) {
  const d = settings.description.toLowerCase();
  const hairStyle = /\bbald\b/.test(d)
    ? "bald"
    : /\bbun\b/.test(d)
      ? "bun"
      : /spik/.test(d)
        ? "spiky"
        : /long hair|ponytail|braid/.test(d)
          ? "long"
          : "short";
  const acc: Partial<Record<AccessoryId, boolean>> = {
    glasses: /glasses|spectacles/.test(d),
    beard: /beard|moustache|mustache/.test(d) && settings.preserve.facialHair,
    cap: /\bcap\b|\bhat\b/.test(d),
    tie: /\btie\b|formal|suit/.test(d),
    cape: settings.style === "fantasy" || /\bcape\b|superhero/.test(d),
    ears: settings.style === "fantasy" || /elf/.test(d),
    visor: /visor|cyber|futur/.test(d),
    headband: /headband|sport/.test(d),
    backpack: /backpack/.test(d),
    crown: /crown|king|queen|royal/.test(d),
  };
  return {
    style: settings.style,
    characterType: settings.characterType,
    proportions: proportionsFor(settings),
    appearance: settings.appearance ?? {},
    hairStyle: hairStyle as "short" | "long" | "bun" | "spiky" | "bald",
    accessories: acc,
  };
}

export async function buildDemoGlb(settings: GenerationSettings) {
  const built = buildDemoCharacter(demoParamsFromSettings(settings));
  const rig = inspectRig(built.root);
  const clips = sampleAll(rig);
  const glb = (await exportGLB(built.root, clips)) as ArrayBuffer;
  return Buffer.from(glb);
}

export class DemoProvider implements ImageTo3DProvider {
  id = "demo";
  info(): ProviderInfo {
    return {
      id: "demo",
      name: "Demo (procedural, no API key)",
      configured: true,
      demo: true,
      capabilities: ["parametric-character", "embedded-skeleton", "embedded-animations", "morph-targets"],
      maxImages: 6,
      notes:
        "Builds a parametric rigged character tinted with colours sampled from your photos. It does not reconstruct your face or body shape. Add a MESHY_API_KEY for real photo-to-3D reconstruction.",
    };
  }
  async startReconstruction() {
    return { taskId: `demo-${crypto.randomUUID()}` };
  }
  async pollReconstruction(): Promise<TaskStatus> {
    // Work happens synchronously in downloadReconstruction; there is no remote queue.
    return { state: "succeeded", progress: null };
  }
  async downloadReconstruction(_taskId: string, input: ReconstructionInput): Promise<ReconstructionResult> {
    return { glb: await buildDemoGlb(input.settings), textures: [], texturedInSameTask: true };
  }
}
