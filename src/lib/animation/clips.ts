// Samples procedural ClipDefs into real three.js AnimationClips for a specific
// skeleton, retargeting canonical bone names onto the rig's own bone names.

import * as THREE from "three";
import { CLIP_MAP, CLIPS, type ClipDef } from "./library";
import { buildRetargetMap, REQUIRED_BONES, type BoneName } from "../character/skeleton";

export const FPS = 30;

export interface RigInfo {
  /** canonical -> actual bone */
  map: Partial<Record<BoneName, string>>;
  missing: BoneName[];
  compatible: boolean;
  /** rest local quaternion & position of every mapped bone */
  rest: Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>;
  /** scale factor for hip translation (rig hip height / 0.95 m) */
  hipScale: number;
  /** morph meshes: morph name -> mesh names that expose it */
  morphs: Record<string, string[]>;
}

/** Inspect a loaded scene and describe how procedural clips can drive it. */
export function inspectRig(root: THREE.Object3D): RigInfo {
  const bones: THREE.Bone[] = [];
  const morphs: Record<string, string[]> = {};
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary) {
      for (const k of Object.keys(m.morphTargetDictionary)) (morphs[k] ??= []).push(m.name);
    }
  });
  const { map, missing } = buildRetargetMap(bones.map((b) => b.name));
  const rest = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  for (const b of bones) rest.set(b.name, { q: b.quaternion.clone(), p: b.position.clone() });

  let hipScale = 1;
  const hipsName = map.hips;
  if (hipsName) {
    const hips = bones.find((b) => b.name === hipsName)!;
    root.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    hips.getWorldPosition(wp);
    const rootPos = new THREE.Vector3();
    root.getWorldPosition(rootPos);
    const h = wp.y - rootPos.y;
    // Local hip translation is expressed in the parent's space; account for scale.
    const parentScale = new THREE.Vector3();
    hips.parent?.getWorldScale(parentScale);
    hipScale = h > 0.05 ? h / 0.95 / (parentScale.y || 1) : 1 / (parentScale.y || 1);
  }
  const compatible = REQUIRED_BONES.every((b) => map[b]);
  return { map, missing, compatible, rest, hipScale, morphs };
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();

export function sampleClip(def: ClipDef, rig: RigInfo, opts: { morphs?: boolean } = {}): THREE.AnimationClip {
  const frames = Math.max(2, Math.round(def.duration * FPS) + 1);
  const times = new Float32Array(frames);
  for (let i = 0; i < frames; i++) times[i] = (i / (frames - 1)) * def.duration;
  // Looping clips reuse t=0 for the final frame so the seam is exact.
  const poses = Array.from({ length: frames }, (_, i) => def.pose(def.loop && i === frames - 1 ? 0 : i / (frames - 1)));

  const used = new Set<BoneName>();
  for (const p of poses) for (const k of Object.keys(p.bones)) used.add(k as BoneName);
  const tracks: THREE.KeyframeTrack[] = [];

  for (const bone of used) {
    const actual = rig.map[bone];
    if (!actual) continue;
    const rest = rig.rest.get(actual);
    if (!rest) continue;
    const values = new Float32Array(frames * 4);
    poses.forEach((p, i) => {
      const e = p.bones[bone] ?? [0, 0, 0];
      _e.set(e[0], e[1], e[2], "XYZ");
      _q.setFromEuler(_e).premultiply(rest.q);
      _q.toArray(values, i * 4);
    });
    tracks.push(new THREE.QuaternionKeyframeTrack(`${actual}.quaternion`, times, values));
  }

  const hipsName = rig.map.hips;
  if (hipsName && poses.some((p) => p.hips)) {
    const rest = rig.rest.get(hipsName)!;
    const values = new Float32Array(frames * 3);
    poses.forEach((p, i) => {
      const h = p.hips ?? [0, 0, 0];
      values[i * 3] = rest.p.x + h[0] * rig.hipScale;
      values[i * 3 + 1] = rest.p.y + h[1] * rig.hipScale;
      values[i * 3 + 2] = rest.p.z + h[2] * rig.hipScale;
    });
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsName}.position`, times, values));
  }

  if (opts.morphs !== false) {
    const morphNames = new Set<string>();
    for (const p of poses) for (const k of Object.keys(p.morphs ?? {})) morphNames.add(k);
    for (const m of morphNames) {
      for (const meshName of rig.morphs[m] ?? []) {
        const values = new Float32Array(frames);
        poses.forEach((p, i) => (values[i] = Math.max(0, Math.min(1, p.morphs?.[m] ?? 0))));
        tracks.push(new THREE.NumberKeyframeTrack(`${meshName}.morphTargetInfluences[${m}]`, times, values));
      }
    }
  }

  return new THREE.AnimationClip(def.id, def.duration, tracks);
}

export function sampleClipById(id: string, rig: RigInfo) {
  const def = CLIP_MAP[id];
  return def ? sampleClip(def, rig) : null;
}

export function sampleAll(rig: RigInfo, ids: string[] = CLIPS.map((c) => c.id)) {
  return ids.map((id) => sampleClipById(id, rig)).filter((c): c is THREE.AnimationClip => !!c);
}
