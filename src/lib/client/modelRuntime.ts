"use client";

// Loads a generated GLB into a runtime model: normalised transform, rest pose,
// animation clips (embedded + provider + retargeted procedural), materials,
// accessories and morph targets that the customiser can drive.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { inspectRig, sampleClip, type RigInfo } from "../animation/clips";
import { CLIP_MAP, CLIPS } from "../animation/library";
import type { Customisation } from "../types";

export type ClipSource = "embedded" | "provider" | "procedural";
export interface ClipEntry {
  id: string;
  name: string;
  source: ClipSource;
  clip: THREE.AnimationClip;
  category: string;
}

export interface LoadedModel {
  wrapper: THREE.Group;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, ClipEntry>;
  rig: RigInfo;
  rest: Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>;
  materials: Map<string, THREE.MeshStandardMaterial>;
  materialDefaults: Map<string, string>;
  roughnessDefaults: Map<string, number>;
  accessories: Map<string, THREE.Object3D>;
  accessoryDefaults: Map<string, boolean>;
  morphs: Map<string, THREE.Mesh[]>;
  head: THREE.Bone | null;
  height: number;
  baseScale: number;
  triangles: number;
  textures: { name: string; texture: THREE.Texture }[];
}

const INTERNAL_MATERIALS = new Set(["EyeWhite", "Mouth"]);

const loader = new GLTFLoader();

export async function loadModel(url: string, providerAnimations: { name: string; url: string }[] = []): Promise<LoadedModel> {
  let gltf;
  try {
    gltf = await loader.loadAsync(url);
  } catch (e) {
    throw new Error(`This model file couldn't be read (${(e as Error).message || "invalid GLB"}).`);
  }
  const root = gltf.scene;
  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) m.frustumCulled = false;
      const g = m.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  if (triangles === 0) throw new Error("The model contains no geometry.");

  // Normalise: feet on the floor, ~1.7 m tall, centred.
  const wrapper = new THREE.Group();
  wrapper.add(root);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const baseScale = size.y > 0 ? 1.7 / size.y : 1;
  root.scale.multiplyScalar(baseScale);
  const box2 = new THREE.Box3().setFromObject(root);
  const c = box2.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box2.min.y;

  const rest = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const accessories = new Map<string, THREE.Object3D>();
  const morphs = new Map<string, THREE.Mesh[]>();
  const textures: LoadedModel["textures"] = [];
  let head: THREE.Bone | null = null;

  root.traverse((o) => {
    rest.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    if (o.name.startsWith("acc_")) accessories.set(o.name.slice(4), o);
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        if (!mat?.isMeshStandardMaterial) continue;
        const name = mat.name || `Material ${materials.size + 1}`;
        if (!materials.has(name) && !INTERNAL_MATERIALS.has(name) && !accessoryAncestor(o)) materials.set(name, mat);
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"] as const) {
          const t = mat[key];
          if (t && !textures.some((x) => x.texture === t)) textures.push({ name: `${name}_${key}`, texture: t });
        }
      }
      if (m.morphTargetDictionary) for (const k of Object.keys(m.morphTargetDictionary)) morphs.set(k, [...(morphs.get(k) ?? []), m]);
    }
  });

  const rig = inspectRig(root);
  if (rig.map.head) head = root.getObjectByName(rig.map.head) as THREE.Bone;

  // Defaults stored by the demo generator (glTF extras → userData).
  const accessoryDefaults = new Map<string, boolean>();
  let meta: { accessories?: Record<string, boolean> } | undefined;
  root.traverse((o) => (o.userData?.persona3d ? (meta = o.userData.persona3d) : null));
  for (const [id, obj] of accessories) {
    const v = meta?.accessories?.[id] ?? obj.visible;
    obj.visible = v;
    accessoryDefaults.set(id, v);
  }
  const materialDefaults = new Map([...materials].map(([k, m]) => [k, `#${m.color.getHexString()}`]));

  const clips = new Map<string, ClipEntry>();
  for (const a of gltf.animations) {
    const def = CLIP_MAP[a.name];
    clips.set(a.name, { id: a.name, name: def?.name ?? a.name, source: "embedded", clip: a, category: def?.category ?? "basic" });
  }
  for (const pa of providerAnimations) {
    try {
      const g = await loader.loadAsync(pa.url);
      const a = g.animations[0];
      if (a) {
        a.name = pa.name;
        clips.set(pa.name, { id: pa.name, name: CLIP_MAP[pa.name]?.name ?? pa.name, source: "provider", clip: a, category: "basic" });
      }
    } catch {
      /* a broken provider clip shouldn't block the model */
    }
  }
  if (rig.compatible) {
    for (const def of CLIPS) {
      // Prefer provider-authored walk/run over procedural ones.
      if (clips.has(def.id)) continue;
      clips.set(def.id, { id: def.id, name: def.name, source: "procedural", clip: sampleClip(def, rig), category: def.category });
    }
  }

  return {
    wrapper,
    root,
    mixer: new THREE.AnimationMixer(root),
    clips,
    rig,
    rest,
    materials,
    materialDefaults,
    roughnessDefaults: new Map(),
    accessories,
    accessoryDefaults,
    morphs,
    head,
    height: 1.7,
    baseScale,
    triangles: Math.round(triangles),
    textures,
  };
}

function accessoryAncestor(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.name.startsWith("acc_")) return true;
  return false;
}

export function applyCustomisation(m: LoadedModel, c: Customisation | null) {
  for (const [name, mat] of m.materials) {
    mat.color.set(c?.colors?.[name] ?? m.materialDefaults.get(name)!);
    if (!m.roughnessDefaults.has(name)) m.roughnessDefaults.set(name, mat.roughness);
    mat.roughness = c?.finish?.[name] ?? m.roughnessDefaults.get(name)!;
  }
  for (const [k, meshes] of m.morphs) {
    if (k === "blink") continue;
    for (const mesh of meshes) mesh.morphTargetInfluences![mesh.morphTargetDictionary![k]] = c?.morphs?.[k] ?? (k === "smile" ? 0.15 : 0);
  }
  for (const [id, obj] of m.accessories) obj.visible = c?.accessories?.[id] ?? m.accessoryDefaults.get(id)!;
  const p = c?.proportions ?? {};
  m.wrapper.scale.setScalar(p.height ?? 1);
  if (m.head) {
    const r = m.rest.get(m.head)!;
    m.head.scale.copy(r.s).multiplyScalar(p.head ?? 1);
  }
}

export function resetPose(m: LoadedModel) {
  m.mixer.stopAllAction();
  for (const [o, r] of m.rest) {
    o.position.copy(r.p);
    o.quaternion.copy(r.q);
    if (o !== m.head) o.scale.copy(r.s);
  }
}

export function clipHasTrack(clip: THREE.AnimationClip | undefined, suffix: string) {
  return !!clip?.tracks.some((t) => t.name.includes(suffix));
}
