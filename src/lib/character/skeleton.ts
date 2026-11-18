// Canonical humanoid skeleton used by procedural animations, plus name maps
// for retargeting onto third-party rigs (Mixamo, Meshy, generic).

export const CANONICAL_BONES = [
  "hips",
  "spine",
  "chest",
  "neck",
  "head",
  "shoulderL",
  "upperArmL",
  "lowerArmL",
  "handL",
  "shoulderR",
  "upperArmR",
  "lowerArmR",
  "handR",
  "upperLegL",
  "lowerLegL",
  "footL",
  "upperLegR",
  "lowerLegR",
  "footR",
] as const;
export type BoneName = (typeof CANONICAL_BONES)[number];

export const BONE_PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  spine: "hips",
  chest: "spine",
  neck: "chest",
  head: "neck",
  shoulderL: "chest",
  upperArmL: "shoulderL",
  lowerArmL: "upperArmL",
  handL: "lowerArmL",
  shoulderR: "chest",
  upperArmR: "shoulderR",
  lowerArmR: "upperArmR",
  handR: "lowerArmR",
  upperLegL: "hips",
  lowerLegL: "upperLegL",
  footL: "lowerLegL",
  upperLegR: "hips",
  lowerLegR: "upperLegR",
  footR: "lowerLegR",
};

/**
 * Candidate names on external rigs for each canonical bone, matched
 * case-insensitively after stripping prefixes like "mixamorig:".
 */
export const RETARGET_ALIASES: Record<BoneName, string[]> = {
  hips: ["hips", "pelvis", "root_hips", "hip"],
  spine: ["spine", "spine01", "spine_01", "spine1"],
  chest: ["spine2", "chest", "spine02", "spine_02", "upperchest", "spine_03"],
  neck: ["neck", "neck01", "neck_01"],
  head: ["head"],
  shoulderL: ["leftshoulder", "shoulderl", "clavicle_l", "l_clavicle", "leftclavicle", "shoulder_l"],
  upperArmL: ["leftarm", "upperarml", "upperarm_l", "l_upperarm", "leftupperarm", "arm_l"],
  lowerArmL: ["leftforearm", "lowerarml", "lowerarm_l", "l_forearm", "forearm_l", "leftlowerarm"],
  handL: ["lefthand", "handl", "hand_l", "l_hand"],
  shoulderR: ["rightshoulder", "shoulderr", "clavicle_r", "r_clavicle", "rightclavicle", "shoulder_r"],
  upperArmR: ["rightarm", "upperarmr", "upperarm_r", "r_upperarm", "rightupperarm", "arm_r"],
  lowerArmR: ["rightforearm", "lowerarmr", "lowerarm_r", "r_forearm", "forearm_r", "rightlowerarm"],
  handR: ["righthand", "handr", "hand_r", "r_hand"],
  upperLegL: ["leftupleg", "upperlegl", "thigh_l", "l_thigh", "leftupperleg", "upperleg_l"],
  lowerLegL: ["leftleg", "lowerlegl", "calf_l", "l_calf", "leftlowerleg", "lowerleg_l", "shin_l"],
  footL: ["leftfoot", "footl", "foot_l", "l_foot"],
  upperLegR: ["rightupleg", "upperlegr", "thigh_r", "r_thigh", "rightupperleg", "upperleg_r"],
  lowerLegR: ["rightleg", "lowerlegr", "calf_r", "r_calf", "rightlowerleg", "lowerleg_r", "shin_r"],
  footR: ["rightfoot", "footr", "foot_r", "r_foot"],
};

export function normaliseBoneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^mixamorig[:_]?/, "")
    .replace(/^armature[|_:]?/, "")
    .replace(/^bip0?1[_ ]?/, "")
    .replace(/[\s.]/g, "");
}

/**
 * Build a map canonical -> actual bone name for a rig. Returns the map and the
 * list of canonical bones that could not be matched.
 */
export function buildRetargetMap(boneNames: string[]): {
  map: Partial<Record<BoneName, string>>;
  missing: BoneName[];
} {
  const lookup = new Map<string, string>();
  for (const n of boneNames) lookup.set(normaliseBoneName(n), n);
  const map: Partial<Record<BoneName, string>> = {};
  const missing: BoneName[] = [];
  for (const bone of CANONICAL_BONES) {
    if (lookup.has(bone.toLowerCase())) {
      map[bone] = lookup.get(bone.toLowerCase());
      continue;
    }
    const hit = RETARGET_ALIASES[bone].find((a) => lookup.has(a));
    if (hit) map[bone] = lookup.get(hit);
    else missing.push(bone);
  }
  return { map, missing };
}

/** Bones an animation needs at minimum for the rig to count as humanoid-compatible. */
export const REQUIRED_BONES: BoneName[] = [
  "hips",
  "spine",
  "head",
  "upperArmL",
  "lowerArmL",
  "upperArmR",
  "lowerArmR",
  "upperLegL",
  "lowerLegL",
  "upperLegR",
  "lowerLegR",
];
