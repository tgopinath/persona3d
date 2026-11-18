// Procedural, fully rigged humanoid used by the Demo provider.
//
// This is NOT photo reconstruction. It is a parametric character whose
// proportions follow the chosen style and body settings and whose colours are
// sampled from the user's photographs. It produces a genuine SkinnedMesh with
// a skeleton, smooth skin weights, morph targets (blink / smile / open / frown)
// and toggleable accessory nodes, so the rest of the pipeline (viewer, rig
// validation, animation, customisation, export) runs on a real 3D asset.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BONE_PARENT, CANONICAL_BONES, type BoneName } from "./skeleton";
import type { AppearanceHints, CharacterType, Proportions, StyleId } from "../types";

export interface DemoCharacterParams {
  style: StyleId;
  characterType: CharacterType;
  proportions: Proportions;
  appearance: AppearanceHints;
  hairStyle?: "short" | "long" | "bun" | "spiky" | "bald";
  accessories?: Partial<Record<AccessoryId, boolean>>;
  seed?: number;
}

export const ACCESSORIES = [
  "glasses",
  "cap",
  "beard",
  "tie",
  "cape",
  "visor",
  "ears",
  "headband",
  "backpack",
  "crown",
] as const;
export type AccessoryId = (typeof ACCESSORIES)[number];

export const MATERIAL_SLOTS = ["Skin", "Hair", "Top", "Bottom", "Shoes", "Eyes", "Accessory", "Cape"] as const;

interface StyleShape {
  head: number;
  limbs: number;
  eyes: number;
  segments: number;
  flat: boolean;
  roughness: number;
  saturate: number;
}

const STYLE_SHAPES: Record<StyleId, StyleShape> = {
  realistic: { head: 1, limbs: 1, eyes: 0.8, segments: 32, flat: false, roughness: 0.65, saturate: 0.9 },
  stylised: { head: 1.3, limbs: 0.92, eyes: 1.3, segments: 28, flat: false, roughness: 0.55, saturate: 1.15 },
  cartoon: { head: 1.45, limbs: 0.88, eyes: 1.5, segments: 24, flat: false, roughness: 0.45, saturate: 1.35 },
  anime: { head: 1.2, limbs: 1.06, eyes: 1.8, segments: 28, flat: false, roughness: 0.5, saturate: 1.2 },
  low_poly: { head: 1.15, limbs: 1, eyes: 1, segments: 6, flat: true, roughness: 0.9, saturate: 1 },
  game_ready: { head: 1.05, limbs: 1, eyes: 0.9, segments: 16, flat: false, roughness: 0.6, saturate: 1 },
  miniature: { head: 1.85, limbs: 0.7, eyes: 1.6, segments: 24, flat: false, roughness: 0.5, saturate: 1.25 },
  fantasy: { head: 1.1, limbs: 1.05, eyes: 1.1, segments: 24, flat: false, roughness: 0.55, saturate: 1.1 },
};

const DEFAULT_COLORS = {
  skin: "#c9926b",
  hair: "#2b1d16",
  top: "#5b4bd6",
  bottom: "#252a3a",
  eyes: "#3a2a1e",
};

function tuneColor(hex: string | undefined, fallback: string, saturate: number) {
  const c = new THREE.Color(hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s * saturate), hsl.l);
  return c;
}

type Seg = { bone: BoneName; a: THREE.Vector3; b: THREE.Vector3 };

/** Attach smooth skin weights computed from distance to candidate bone segments. */
function skinGeometry(geo: THREE.BufferGeometry, segs: Seg[], boneIndex: Record<BoneName, number>, falloff = 0.03) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const idx = new Uint16Array(n * 4);
  const wts = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const line = new THREE.Line3();
  const closest = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const scored = segs.map((s) => {
      line.set(s.a, s.b);
      line.closestPointToPoint(p, true, closest);
      return { bone: s.bone, d: closest.distanceTo(p) };
    });
    const dmin = Math.min(...scored.map((x) => x.d));
    const weighted = scored
      .map((x) => ({ bone: x.bone, w: Math.exp(-(x.d - dmin) / falloff) }))
      .sort((a, b) => b.w - a.w)
      .slice(0, 4);
    const sum = weighted.reduce((a, b) => a + b.w, 0);
    weighted.forEach((x, k) => {
      idx[i * 4 + k] = boneIndex[x.bone];
      wts[i * 4 + k] = x.w / sum;
    });
  }
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}

/** mergeGeometries needs identical attribute sets on every input. */
function prep(g: THREE.BufferGeometry) {
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

/** Capsule between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, segs: number) {
  const len = a.distanceTo(b);
  const geo = new THREE.CylinderGeometry(r1, r0, len, Math.max(5, segs), 6, false);
  const capA = new THREE.SphereGeometry(r0, Math.max(5, segs), Math.max(4, segs >> 1));
  const capB = new THREE.SphereGeometry(r1, Math.max(5, segs), Math.max(4, segs >> 1));
  capA.translate(0, -len / 2, 0);
  capB.translate(0, len / 2, 0);
  const merged = mergeGeometries([prep(geo), prep(capA), prep(capB)])!;
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  merged.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  merged.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return merged;
}

function ellipsoid(c: THREE.Vector3, r: THREE.Vector3, segs: number) {
  const g = new THREE.SphereGeometry(1, Math.max(6, segs), Math.max(5, segs >> 1));
  g.scale(r.x, r.y, r.z);
  g.translate(c.x, c.y, c.z);
  return prep(g);
}

export interface BuiltCharacter {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Record<BoneName, THREE.Bone>;
  materials: Record<string, THREE.MeshStandardMaterial>;
  accessories: Record<AccessoryId, THREE.Object3D>;
}

export function buildDemoCharacter(params: DemoCharacterParams): BuiltCharacter {
  const shape = STYLE_SHAPES[params.style] ?? STYLE_SHAPES.realistic;
  const P = params.proportions;
  const H = 0.95 * P.height; // hip height
  const limbK = shape.limbs * P.limbs;
  const segs = shape.segments;
  const headR = 0.105 * shape.head * P.head;
  const shoulderW = 0.165 * P.shoulders;
  const hipW = 0.09 * P.hips;
  const legLen = H * limbK;
  const hipsY = Math.max(0.35, legLen);
  const torso = 0.52 * P.height;

  // ── Joint positions in bind (world) space ──
  const J: Record<BoneName, THREE.Vector3> = {
    hips: new THREE.Vector3(0, hipsY, 0),
    spine: new THREE.Vector3(0, hipsY + torso * 0.22, 0),
    chest: new THREE.Vector3(0, hipsY + torso * 0.55, 0),
    neck: new THREE.Vector3(0, hipsY + torso * 0.93, 0),
    head: new THREE.Vector3(0, hipsY + torso * 0.93 + 0.055, 0),
    shoulderL: new THREE.Vector3(0.04, hipsY + torso * 0.86, 0),
    upperArmL: new THREE.Vector3(shoulderW, hipsY + torso * 0.86, 0),
    lowerArmL: new THREE.Vector3(shoulderW + 0.025, hipsY + torso * 0.86 - 0.27 * limbK, -0.01),
    handL: new THREE.Vector3(shoulderW + 0.04, hipsY + torso * 0.86 - 0.52 * limbK, 0.01),
    shoulderR: new THREE.Vector3(-0.04, hipsY + torso * 0.86, 0),
    upperArmR: new THREE.Vector3(-shoulderW, hipsY + torso * 0.86, 0),
    lowerArmR: new THREE.Vector3(-shoulderW - 0.025, hipsY + torso * 0.86 - 0.27 * limbK, -0.01),
    handR: new THREE.Vector3(-shoulderW - 0.04, hipsY + torso * 0.86 - 0.52 * limbK, 0.01),
    upperLegL: new THREE.Vector3(hipW, hipsY - 0.04, 0),
    lowerLegL: new THREE.Vector3(hipW, hipsY - 0.04 - legLen * 0.48, 0.01),
    footL: new THREE.Vector3(hipW, 0.08, 0),
    upperLegR: new THREE.Vector3(-hipW, hipsY - 0.04, 0),
    lowerLegR: new THREE.Vector3(-hipW, hipsY - 0.04 - legLen * 0.48, 0.01),
    footR: new THREE.Vector3(-hipW, 0.08, 0),
  };
  const headC = new THREE.Vector3(0, J.head.y + headR * 0.95, 0.005);

  // ── Bones ──
  const bones = {} as Record<BoneName, THREE.Bone>;
  const boneIndex = {} as Record<BoneName, number>;
  CANONICAL_BONES.forEach((name, i) => {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
    boneIndex[name] = i;
  });
  for (const name of CANONICAL_BONES) {
    const parent = BONE_PARENT[name];
    if (parent) {
      bones[parent].add(bones[name]);
      bones[name].position.subVectors(J[name], J[parent]);
    } else bones[name].position.copy(J[name]);
  }

  const S = (bone: BoneName, to: THREE.Vector3): Seg => ({ bone, a: J[bone], b: to });
  const SEG: Record<BoneName, Seg> = {
    hips: S("hips", J.spine),
    spine: S("spine", J.chest),
    chest: S("chest", J.neck),
    neck: S("neck", J.head),
    head: S("head", headC),
    shoulderL: S("shoulderL", J.upperArmL),
    upperArmL: S("upperArmL", J.lowerArmL),
    lowerArmL: S("lowerArmL", J.handL),
    handL: S("handL", J.handL.clone().add(new THREE.Vector3(0.01, -0.08, 0.01))),
    shoulderR: S("shoulderR", J.upperArmR),
    upperArmR: S("upperArmR", J.lowerArmR),
    lowerArmR: S("lowerArmR", J.handR),
    handR: S("handR", J.handR.clone().add(new THREE.Vector3(-0.01, -0.08, 0.01))),
    upperLegL: S("upperLegL", J.lowerLegL),
    lowerLegL: S("lowerLegL", J.footL),
    footL: S("footL", J.footL.clone().add(new THREE.Vector3(0, -0.04, 0.14))),
    upperLegR: S("upperLegR", J.lowerLegR),
    lowerLegR: S("lowerLegR", J.footR),
    footR: S("footR", J.footR.clone().add(new THREE.Vector3(0, -0.04, 0.14))),
  };
  const segsFor = (...names: BoneName[]) => names.map((n) => SEG[n]);

  // ── Materials ──
  const A = params.appearance ?? {};
  const mat = (name: string, color: THREE.Color, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: shape.roughness, metalness: 0, flatShading: shape.flat, ...extra });
    m.name = name;
    return m;
  };
  const materials: Record<string, THREE.MeshStandardMaterial> = {
    Skin: mat("Skin", tuneColor(A.skin, DEFAULT_COLORS.skin, 1)),
    Hair: mat("Hair", tuneColor(A.hair, DEFAULT_COLORS.hair, shape.saturate), { roughness: 0.8 }),
    Top: mat("Top", tuneColor(A.top, DEFAULT_COLORS.top, shape.saturate)),
    Bottom: mat("Bottom", tuneColor(A.bottom, DEFAULT_COLORS.bottom, shape.saturate)),
    Shoes: mat("Shoes", new THREE.Color("#1d1d22"), { roughness: 0.4 }),
    Eyes: mat("Eyes", tuneColor(A.eyes, DEFAULT_COLORS.eyes, 1), { roughness: 0.2 }),
    EyeWhite: mat("EyeWhite", new THREE.Color("#f4f1ec"), { roughness: 0.3 }),
    Mouth: mat("Mouth", new THREE.Color("#8a3b3b"), { roughness: 0.5 }),
    Accessory: mat("Accessory", new THREE.Color("#111318"), { roughness: 0.3, metalness: 0.6 }),
    Cape: mat("Cape", new THREE.Color("#7c3aed"), { roughness: 0.7, side: THREE.DoubleSide }),
  };

  const root = new THREE.Group();
  root.name = "Persona3D_Character";
  const armature = new THREE.Group();
  armature.name = "Armature";
  armature.add(bones.hips);
  root.add(armature);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(CANONICAL_BONES.map((n) => bones[n]));

  const addSkinned = (name: string, geos: [THREE.BufferGeometry, Seg[]][], material: THREE.Material) => {
    if (!geos.length) return;
    const skinned = geos.map(([g, s]) => skinGeometry(g, s, boneIndex));
    const geo = mergeGeometries(skinned)!;
    geo.computeVertexNormals();
    const mesh = new THREE.SkinnedMesh(geo, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton);
  };

  const type = params.characterType;
  const hasArms = type !== "head";
  const hasLegs = type === "full_body";
  const chestR = new THREE.Vector3(0.15 * P.shoulders, torso * 0.26, 0.1);

  // Skin: head, neck, hands, forearms
  const skinParts: [THREE.BufferGeometry, Seg[]][] = [
    [ellipsoid(headC, new THREE.Vector3(headR * 0.92, headR, headR * 0.98), segs), segsFor("head")],
    [limb(J.neck.clone().add(new THREE.Vector3(0, -0.03, 0)), J.head.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.045, 0.042, segs), segsFor("neck", "head", "chest")],
    // nose & ears
    [ellipsoid(headC.clone().add(new THREE.Vector3(0, -headR * 0.12, headR * 0.95)), new THREE.Vector3(headR * 0.12, headR * 0.16, headR * 0.12), segs >> 1), segsFor("head")],
    [ellipsoid(headC.clone().add(new THREE.Vector3(headR * 0.93, -headR * 0.05, 0)), new THREE.Vector3(headR * 0.1, headR * 0.2, headR * 0.12), segs >> 1), segsFor("head")],
    [ellipsoid(headC.clone().add(new THREE.Vector3(-headR * 0.93, -headR * 0.05, 0)), new THREE.Vector3(headR * 0.1, headR * 0.2, headR * 0.12), segs >> 1), segsFor("head")],
  ];
  if (hasArms) {
    for (const side of ["L", "R"] as const) {
      const lo = `lowerArm${side}` as BoneName;
      const ha = `hand${side}` as BoneName;
      skinParts.push([limb(J[lo], J[ha], 0.036, 0.03, segs), segsFor(lo, ha, `upperArm${side}` as BoneName)]);
      skinParts.push([ellipsoid(SEG[ha].a.clone().lerp(SEG[ha].b, 0.5), new THREE.Vector3(0.028, 0.052, 0.04), segs), segsFor(ha, lo)]);
    }
  }
  addSkinned("Body_Skin", skinParts, materials.Skin);

  // Top: one continuous lathed torso (no seams) + shoulder caps + sleeves
  const lathe = (profile: [number, number][], depth: number, centre: THREE.Vector3) => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
    g.scale(1, 1, depth);
    g.translate(centre.x, centre.y, centre.z);
    return prep(g);
  };
  const topParts: [THREE.BufferGeometry, Seg[]][] = [];
  if (type !== "head") {
    const sw = 0.15 * P.shoulders;
    const ww = 0.125 * P.hips;
    const y0 = hipsY - 0.02;
    const yN = J.neck.y - hipsY;
    topParts.push([
      lathe(
        [
          [0.001, -0.005],
          [ww * 1.02, 0],
          [ww * 0.97, torso * 0.2],
          [sw * 0.93, torso * 0.5],
          [sw, torso * 0.72],
          [sw * 0.92, torso * 0.84],
          [sw * 0.55, yN - 0.012],
          [0.05, yN + 0.005],
          [0.001, yN + 0.01],
        ],
        0.62,
        new THREE.Vector3(0, y0, 0)
      ),
      segsFor("chest", "spine", "hips", "shoulderL", "shoulderR", "neck"),
    ]);
    for (const side of ["L", "R"] as const) {
      const up = `upperArm${side}` as BoneName;
      topParts.push([ellipsoid(J[up].clone().add(new THREE.Vector3(0, -0.005, 0)), new THREE.Vector3(0.058, 0.055, 0.058), segs), segsFor(up, `shoulder${side}` as BoneName, "chest")]);
      topParts.push([limb(J[up], J[`lowerArm${side}` as BoneName], 0.052, 0.042, segs), segsFor(up, `shoulder${side}` as BoneName, `lowerArm${side}` as BoneName)]);
    }
  } else {
    topParts.push([ellipsoid(J.neck.clone().add(new THREE.Vector3(0, -0.06, 0)), new THREE.Vector3(0.13, 0.06, 0.08), segs), segsFor("chest", "neck")]);
  }
  addSkinned("Body_Top", topParts, materials.Top);

  // Bottom: pelvis + legs
  if (hasLegs || type === "upper_body") {
    const bottomParts: [THREE.BufferGeometry, Seg[]][] = [
      [
        lathe(
          [
            [0.001, -0.1],
            [0.11 * P.hips, -0.095],
            [0.14 * P.hips, -0.04],
            [0.132 * P.hips, 0.03],
            [0.128 * P.hips, 0.06],
            [0.001, 0.065],
          ],
          0.7,
          J.hips
        ),
        segsFor("hips", "spine", "upperLegL", "upperLegR"),
      ],
    ];
    if (hasLegs) {
      for (const side of ["L", "R"] as const) {
        const ul = `upperLeg${side}` as BoneName;
        const ll = `lowerLeg${side}` as BoneName;
        bottomParts.push([limb(J[ul].clone().add(new THREE.Vector3(0, 0.02, 0)), J[ll], 0.078, 0.056, segs), segsFor(ul, ll, "hips")]);
        bottomParts.push([limb(J[ll], J[`foot${side}` as BoneName].clone().add(new THREE.Vector3(0, 0.03, 0)), 0.055, 0.042, segs), segsFor(ll, ul, `foot${side}` as BoneName)]);
      }
    }
    addSkinned("Body_Bottom", bottomParts, materials.Bottom);
  }

  if (hasLegs) {
    const shoes: [THREE.BufferGeometry, Seg[]][] = [];
    for (const side of ["L", "R"] as const) {
      const f = `foot${side}` as BoneName;
      shoes.push([ellipsoid(J[f].clone().add(new THREE.Vector3(0, -0.042, 0.045)), new THREE.Vector3(0.052, 0.042, 0.12), segs), segsFor(f)]);
    }
    addSkinned("Body_Shoes", shoes, materials.Shoes);
  }

  // ── Hair (skinned to head) ──
  const hairStyle = params.hairStyle ?? "short";
  if (hairStyle !== "bald") {
    const hp: [THREE.BufferGeometry, Seg[]][] = [];
    const cap = new THREE.SphereGeometry(headR * 1.06, segs, segs >> 1, 0, Math.PI * 2, 0, Math.PI * 0.55);
    cap.rotateX(-0.25);
    cap.translate(headC.x, headC.y + headR * 0.02, headC.z - headR * 0.04);
    hp.push([prep(cap), segsFor("head")]);
    if (hairStyle === "long") hp.push([ellipsoid(headC.clone().add(new THREE.Vector3(0, -headR * 0.7, -headR * 0.55)), new THREE.Vector3(headR * 0.95, headR * 1.1, headR * 0.45), segs), segsFor("head", "neck")]);
    if (hairStyle === "bun") hp.push([ellipsoid(headC.clone().add(new THREE.Vector3(0, headR * 0.85, -headR * 0.55)), new THREE.Vector3(headR * 0.38, headR * 0.38, headR * 0.38), segs), segsFor("head")]);
    if (hairStyle === "spiky")
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 1.4 - Math.PI * 0.7;
        const g = new THREE.ConeGeometry(headR * 0.22, headR * 0.6, Math.max(4, segs >> 2));
        g.rotateZ(-a * 0.6);
        g.rotateX(-0.5);
        g.translate(headC.x + Math.sin(a) * headR * 0.6, headC.y + headR * 0.9, headC.z - headR * 0.2);
        hp.push([prep(g), segsFor("head")]);
      }
    addSkinned("Hair", hp, materials.Hair);
  }

  // ── Face features with morph targets (children of head bone) ──
  const toHead = (v: THREE.Vector3) => v.clone().sub(J.head);
  const eyeR = headR * 0.15 * shape.eyes;
  const face = new THREE.Group();
  face.name = "Face";
  bones.head.add(face);
  for (const side of [1, -1]) {
    const c = toHead(headC.clone().add(new THREE.Vector3(side * headR * 0.36, headR * 0.1, headR * 0.82)));
    const white = new THREE.Mesh(new THREE.SphereGeometry(eyeR, segs, segs >> 1), materials.EyeWhite);
    white.name = side > 0 ? "EyeWhite_L" : "EyeWhite_R";
    white.position.copy(c);
    white.scale.set(1, 1.1, 0.6);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.6, segs, segs >> 1), materials.Eyes);
    iris.name = side > 0 ? "Iris_L" : "Iris_R";
    iris.position.copy(c).add(new THREE.Vector3(0, 0, eyeR * 0.45));
    iris.scale.set(1, 1.1, 0.5);
    face.add(white, iris);
  }
  // Eyelids: one mesh, morph "blink" closes both.
  {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [1, -1]) {
      const g = new THREE.SphereGeometry(eyeR * 1.12, segs, segs >> 1, 0, Math.PI * 2, 0, Math.PI * 0.3);
      g.scale(1, 1.1, 0.75);
      const c = toHead(headC.clone().add(new THREE.Vector3(side * headR * 0.36, headR * 0.1, headR * 0.82)));
      g.translate(c.x, c.y, c.z + eyeR * 0.08);
      parts.push(prep(g));
    }
    const geo = mergeGeometries(parts)!;
    const pos = geo.attributes.position;
    const blink = new Float32Array(pos.count * 3);
    // Rotate each lid down around its eye centre (approximate by moving along y/z).
    for (let i = 0; i < pos.count; i++) {
      const side = pos.getX(i) > 0 ? 1 : -1;
      const cy = toHead(headC).y + headR * 0.1;
      const cz = toHead(headC).z + headR * 0.82;
      const y = pos.getY(i) - cy;
      const z = pos.getZ(i) - cz;
      // mirror the cap below the equator → eye closed
      blink[i * 3] = pos.getX(i);
      blink[i * 3 + 1] = cy + (-y * 0.15);
      blink[i * 3 + 2] = cz + Math.abs(z) + eyeR * 0.15;
      void side;
    }
    geo.morphAttributes.position = [new THREE.Float32BufferAttribute(blink, 3)];
    // morphTargetsRelative false: absolute positions
    const lids = new THREE.Mesh(geo, materials.Skin);
    lids.name = "Face_Eyelids";
    lids.morphTargetDictionary = { blink: 0 };
    lids.morphTargetInfluences = [0];
    face.add(lids);
  }
  // Mouth: morphs smile / open / frown
  {
    const w = headR * 0.42;
    const g = new THREE.BoxGeometry(w, headR * 0.06, headR * 0.06, 12, 2, 2);
    const mc = toHead(headC.clone().add(new THREE.Vector3(0, -headR * 0.45, headR * 0.86)));
    g.translate(mc.x, mc.y, mc.z);
    prep(g);
    const pos = g.attributes.position;
    const mk = (fn: (x: number, y: number, z: number) => [number, number, number]) => {
      const arr = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
        arr[i * 3] = x;
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = z;
      }
      return new THREE.Float32BufferAttribute(arr, 3);
    };
    const curve = (x: number) => ((x - mc.x) / (w / 2)) ** 2;
    g.morphAttributes.position = [
      mk((x, y, z) => [x * 1.08, y + curve(x) * headR * 0.12, z]),
      mk((x, y, z) => [x * 0.75, mc.y + (y - mc.y) * 5, z]),
      mk((x, y, z) => [x, y - curve(x) * headR * 0.1, z]),
    ];
    const mouth = new THREE.Mesh(g, materials.Mouth);
    mouth.name = "Face_Mouth";
    mouth.morphTargetDictionary = { smile: 0, open: 1, frown: 2 };
    mouth.morphTargetInfluences = [0.15, 0, 0];
    face.add(mouth);
  }

  // ── Accessories (rigid children of bones; hidden unless enabled) ──
  const accessories = {} as Record<AccessoryId, THREE.Object3D>;
  const addAcc = (id: AccessoryId, bone: BoneName, build: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    g.name = `acc_${id}`;
    build(g);
    g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = true) : null));
    g.visible = !!params.accessories?.[id];
    g.userData.accessory = id;
    bones[bone].add(g);
    accessories[id] = g;
  };
  const hc = toHead(headC);
  addAcc("glasses", "head", (g) => {
    for (const side of [1, -1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(eyeR * 1.5, eyeR * 0.18, 8, 24), materials.Accessory);
      ring.position.set(side * headR * 0.36, hc.y + headR * 0.1, hc.z + headR * 0.98);
      g.add(ring);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.22, eyeR * 0.25, eyeR * 0.25), materials.Accessory);
    bridge.position.set(0, hc.y + headR * 0.14, hc.z + headR * 0.98);
    g.add(bridge);
  });
  addAcc("cap", "head", (g) => {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.1, segs, segs >> 1, 0, Math.PI * 2, 0, Math.PI * 0.5), materials.Accessory);
    dome.position.set(0, hc.y + headR * 0.08, hc.z);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.75, headR * 0.75, headR * 0.05, segs, 1, false, -Math.PI / 2, Math.PI), materials.Accessory);
    brim.position.set(0, hc.y + headR * 0.1, hc.z + headR * 0.75);
    g.add(dome, brim);
  });
  addAcc("beard", "head", (g) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.75, segs, segs >> 1, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), materials.Hair);
    b.position.set(0, hc.y - headR * 0.15, hc.z + headR * 0.32);
    b.scale.set(1.05, 1, 0.85);
    g.add(b);
  });
  addAcc("visor", "head", (g) => {
    const v = new THREE.Mesh(
      new THREE.CylinderGeometry(headR * 1.02, headR * 1.02, headR * 0.32, segs, 1, true, -Math.PI * 0.45, Math.PI * 0.9),
      new THREE.MeshStandardMaterial({ name: "Visor", color: "#38bdf8", emissive: "#0ea5e9", emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.1, side: THREE.DoubleSide })
    );
    v.position.set(0, hc.y + headR * 0.1, hc.z);
    g.add(v);
  });
  addAcc("ears", "head", (g) => {
    for (const side of [1, -1]) {
      const e = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.12, headR * 0.6, 8), materials.Skin);
      e.position.set(side * headR * 1.05, hc.y + headR * 0.15, hc.z - headR * 0.05);
      e.rotation.z = -side * 1.1;
      g.add(e);
    }
  });
  addAcc("headband", "head", (g) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.98, headR * 0.07, 8, segs), new THREE.MeshStandardMaterial({ name: "Headband", color: "#ef4444", roughness: 0.6 }));
    t.rotation.x = Math.PI / 2 - 0.2;
    t.position.set(0, hc.y + headR * 0.35, hc.z);
    g.add(t);
  });
  addAcc("crown", "head", (g) => {
    const gold = new THREE.MeshStandardMaterial({ name: "Gold", color: "#f5c542", metalness: 1, roughness: 0.25 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.7, headR * 0.72, headR * 0.25, segs, 1, true), gold);
    band.position.set(0, hc.y + headR * 0.95, hc.z);
    g.add(band);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.1, headR * 0.3, 6), gold);
      const a = (i / 6) * Math.PI * 2;
      sp.position.set(Math.sin(a) * headR * 0.7, hc.y + headR * 1.2, hc.z + Math.cos(a) * headR * 0.7);
      g.add(sp);
    }
  });
  const chestLocal = new THREE.Vector3(0, 0, 0);
  addAcc("tie", "chest", (g) => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.01), new THREE.MeshStandardMaterial({ name: "Tie", color: "#b91c1c", roughness: 0.5 }));
    t.position.set(chestLocal.x, -0.02, chestR.z + 0.006);
    g.add(t);
  });
  addAcc("cape", "chest", (g) => {
    const geo = new THREE.PlaneGeometry(0.42 * P.shoulders, hipsY * 1.05, 4, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, -Math.abs(pos.getX(i)) * 0.15 - (0.5 - pos.getY(i) / (hipsY * 1.05)) * 0.12);
    geo.computeVertexNormals();
    const cape = new THREE.Mesh(geo, materials.Cape);
    cape.position.set(0, J.neck.y - J.chest.y - hipsY * 0.5, -chestR.z - 0.02);
    g.add(cape);
  });
  addAcc("backpack", "chest", (g) => {
    const bp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.12), new THREE.MeshStandardMaterial({ name: "Backpack", color: "#334155", roughness: 0.8 }));
    bp.position.set(0, -0.04, -chestR.z - 0.06);
    g.add(bp);
  });

  root.userData.persona3d = {
    generator: "persona3d-demo",
    version: 1,
    style: params.style,
    accessories: Object.fromEntries(ACCESSORIES.map((a) => [a, !!params.accessories?.[a]])),
  };
  return { root, skeleton, bones, materials, accessories };
}
