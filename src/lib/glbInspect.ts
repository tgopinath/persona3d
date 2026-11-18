// Minimal GLB (glTF 2.0 binary) reader for validation — reads the JSON chunk
// only, so it works on the server without a GPU or DOM.

import { buildRetargetMap, REQUIRED_BONES } from "./character/skeleton";

export interface GlbReport {
  valid: boolean;
  error?: string;
  meshes: number;
  triangles: number;
  materials: string[];
  textures: number;
  skins: number;
  joints: string[];
  animations: { name: string; duration: number }[];
  morphTargets: string[];
  humanoid: boolean;
  missingBones: string[];
  accessories: string[];
}

interface Gltf {
  asset?: { version?: string };
  meshes?: { name?: string; primitives: { indices?: number; attributes: Record<string, number>; mode?: number; targets?: unknown[] }[]; extras?: { targetNames?: string[] } }[];
  materials?: { name?: string }[];
  textures?: unknown[];
  skins?: { joints: number[] }[];
  nodes?: { name?: string; extras?: Record<string, unknown> }[];
  accessors?: { count: number; max?: number[] }[];
  animations?: { name?: string; samplers: { input: number }[] }[];
}

export function readGlbJson(buf: Uint8Array): Gltf {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 20) throw new Error("File too small to be a GLB");
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB file (bad magic)");
  if (dv.getUint32(4, true) !== 2) throw new Error("Unsupported glTF version (expected 2)");
  const total = dv.getUint32(8, true);
  if (total > buf.byteLength) throw new Error("GLB is truncated");
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("First GLB chunk is not JSON");
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len)));
}

export function inspectGlb(buf: Uint8Array): GlbReport {
  const empty: GlbReport = { valid: false, meshes: 0, triangles: 0, materials: [], textures: 0, skins: 0, joints: [], animations: [], morphTargets: [], humanoid: false, missingBones: [], accessories: [] };
  let j: Gltf;
  try {
    j = readGlbJson(buf);
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }
  const acc = j.accessors ?? [];
  let triangles = 0;
  const morph = new Set<string>();
  for (const m of j.meshes ?? []) {
    for (const p of m.primitives) {
      const count = p.indices !== undefined ? acc[p.indices]?.count : acc[p.attributes.POSITION]?.count;
      if ((p.mode ?? 4) === 4) triangles += Math.floor((count ?? 0) / 3);
    }
    for (const n of m.extras?.targetNames ?? []) morph.add(n);
  }
  const nodes = j.nodes ?? [];
  const jointNames = [...new Set((j.skins ?? []).flatMap((s) => s.joints.map((i) => nodes[i]?.name ?? `joint_${i}`)))];
  const { missing } = buildRetargetMap(jointNames);
  const humanoid = jointNames.length > 0 && REQUIRED_BONES.every((b) => !missing.includes(b));
  const animations = (j.animations ?? []).map((a, i) => ({
    name: a.name || `animation_${i}`,
    duration: Math.max(0, ...a.samplers.map((s) => acc[s.input]?.max?.[0] ?? 0)),
  }));
  const meshes = j.meshes?.length ?? 0;
  return {
    valid: meshes > 0,
    error: meshes > 0 ? undefined : "GLB contains no meshes",
    meshes,
    triangles,
    materials: (j.materials ?? []).map((m, i) => m.name || `material_${i}`),
    textures: j.textures?.length ?? 0,
    skins: j.skins?.length ?? 0,
    joints: jointNames,
    animations,
    morphTargets: [...morph],
    humanoid,
    missingBones: missing,
    accessories: nodes.filter((n) => n.name?.startsWith("acc_")).map((n) => n.name!.slice(4)),
  };
}
