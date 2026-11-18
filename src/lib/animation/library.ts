// Procedural motion library authored against the canonical skeleton.
//
// Every clip is a pure function of normalised time t ∈ [0, 1) returning euler
// offsets (radians) relative to the rest pose. Clips are sampled into real
// three.js keyframe tracks (see ./clips.ts) and can be embedded in a GLB or
// retargeted by bone name onto other humanoid rigs.
//
// Axis conventions (character faces +Z, its left side is +X, arms hang down):
//   upperArmL +Z / upperArmR -Z  → raise arm sideways
//   upperArm  -X                 → raise arm forwards
//   lowerArm  -X                 → bend elbow
//   upperLeg  -X                 → lift leg forwards,  lowerLeg +X → bend knee
//   spine/chest +X               → lean forwards,      head +Y → look left

import type { BoneName } from "../character/skeleton";

export type Euler3 = [number, number, number];
export interface Pose {
  bones: Partial<Record<BoneName, Euler3>>;
  hips?: Euler3; // positional offset of the hips in metres (for a 1.7 m rig)
  morphs?: Record<string, number>;
}

export type AnimationCategory = "basic" | "sports" | "fun";

export interface ClipDef {
  id: string;
  name: string;
  category: AnimationCategory;
  duration: number;
  loop: boolean;
  description: string;
  pose: (t: number) => Pose;
}

const TAU = Math.PI * 2;
const s = (t: number, k = 1, p = 0) => Math.sin(TAU * k * t + p);
const c = (t: number, k = 1, p = 0) => Math.cos(TAU * k * t + p);
const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
/** Rise 0→1 between a and b, hold, fall between c and d. */
const env = (t: number, a: number, b: number, cc: number, d: number) =>
  t < a ? 0 : t < b ? ease((t - a) / (b - a)) : t < cc ? 1 : t < d ? 1 - ease((t - cc) / (d - cc)) : 0;
const step = (x: number, n: number) => Math.round(x * n) / n;

const ARMS_RELAXED: Partial<Record<BoneName, Euler3>> = {
  upperArmL: [0, 0, 0.08],
  upperArmR: [0, 0, -0.08],
  lowerArmL: [-0.15, 0, 0],
  lowerArmR: [-0.15, 0, 0],
};

function walkCycle(t: number, amp = 1, lean = 0): Pose {
  const leg = 0.5 * amp;
  return {
    bones: {
      spine: [lean + 0.03, s(t) * 0.05, 0],
      chest: [0, -s(t) * 0.12 * amp, 0],
      head: [-lean * 0.6, s(t) * 0.04, 0],
      upperLegL: [-s(t) * leg, 0, 0],
      upperLegR: [s(t) * leg, 0, 0],
      lowerLegL: [Math.max(0, c(t)) * 0.9 * amp + 0.05, 0, 0],
      lowerLegR: [Math.max(0, -c(t)) * 0.9 * amp + 0.05, 0, 0],
      footL: [s(t) * 0.2, 0, 0],
      footR: [-s(t) * 0.2, 0, 0],
      upperArmL: [s(t) * 0.45 * amp, 0, 0.08],
      upperArmR: [-s(t) * 0.45 * amp, 0, -0.08],
      lowerArmL: [-0.25 - 0.2 * amp, 0, 0],
      lowerArmR: [-0.25 - 0.2 * amp, 0, 0],
    },
    hips: [0, -Math.abs(c(t)) * 0.03 * amp + 0.01, 0],
  };
}

function wavePose(t: number): Partial<Record<BoneName, Euler3>> {
  return {
    upperArmR: [-0.2, 0, -2.45],
    lowerArmR: [0, 0, -0.35 + s(t, 2) * 0.45],
    handR: [0, 0, s(t, 2, 0.6) * 0.2],
    head: [0, -0.12, -0.05],
  };
}

export const CLIPS: ClipDef[] = [
  // ───────────── Basic ─────────────
  {
    id: "idle",
    name: "Idle",
    category: "basic",
    duration: 4,
    loop: true,
    description: "Relaxed standing with breathing and subtle head movement.",
    pose: (t) => ({
      bones: {
        ...ARMS_RELAXED,
        spine: [0.02 * s(t), 0, 0.01 * s(t, 0.5)],
        chest: [-0.03 * s(t, 2), 0, 0],
        head: [0.03 * s(t, 1, 1), 0.18 * s(t, 0.5), 0.02 * s(t)],
        upperArmL: [0.03 * s(t), 0, 0.08 + 0.02 * s(t, 2)],
        upperArmR: [0.03 * s(t), 0, -0.08 - 0.02 * s(t, 2)],
      },
      hips: [0.01 * s(t, 0.5), 0.004 * s(t, 2), 0],
      morphs: { blink: t > 0.48 && t < 0.52 ? 1 - Math.abs(t - 0.5) * 50 : 0 },
    }),
  },
  {
    id: "standing",
    name: "Standing",
    category: "basic",
    duration: 3,
    loop: true,
    description: "Neutral upright stance.",
    pose: (t) => ({ bones: { ...ARMS_RELAXED, chest: [-0.02 * s(t), 0, 0] } }),
  },
  { id: "walking", name: "Walking", category: "basic", duration: 1.1, loop: true, description: "Natural walk cycle in place.", pose: (t) => walkCycle(t, 1) },
  {
    id: "running",
    name: "Running",
    category: "basic",
    duration: 0.7,
    loop: true,
    description: "Energetic run with forward lean.",
    pose: (t) => {
      const p = walkCycle(t, 1.6, 0.22);
      p.bones.lowerArmL = [-1.4, 0, 0];
      p.bones.lowerArmR = [-1.4, 0, 0];
      p.hips = [0, Math.abs(s(t)) * 0.06 - 0.03, 0];
      return p;
    },
  },
  {
    id: "jumping",
    name: "Jumping",
    category: "basic",
    duration: 1.3,
    loop: true,
    description: "Crouch, jump and land.",
    pose: (t) => {
      const crouch = env(t, 0, 0.18, 0.22, 0.32) + env(t, 0.72, 0.82, 0.86, 1);
      const air = env(t, 0.28, 0.48, 0.52, 0.76);
      return {
        bones: {
          spine: [0.35 * crouch, 0, 0],
          upperLegL: [-0.9 * crouch - 0.2 * air, 0, 0],
          upperLegR: [-0.9 * crouch - 0.2 * air, 0, 0],
          lowerLegL: [1.5 * crouch + 0.4 * air, 0, 0],
          lowerLegR: [1.5 * crouch + 0.4 * air, 0, 0],
          footL: [-0.6 * crouch, 0, 0],
          footR: [-0.6 * crouch, 0, 0],
          upperArmL: [0.6 * crouch - 2.6 * air, 0, 0.2],
          upperArmR: [0.6 * crouch - 2.6 * air, 0, -0.2],
          head: [-0.2 * air, 0, 0],
        },
        hips: [0, -0.28 * crouch + 0.42 * air, 0],
      };
    },
  },
  {
    id: "waving",
    name: "Waving",
    category: "basic",
    duration: 1.4,
    loop: true,
    description: "Friendly right-hand wave.",
    pose: (t) => ({ bones: { ...ARMS_RELAXED, ...wavePose(t), chest: [0, -0.1, 0.04] }, morphs: { smile: 0.8 } }),
  },
  {
    id: "dancing",
    name: "Dancing",
    category: "basic",
    duration: 2,
    loop: true,
    description: "Upbeat side-step groove.",
    pose: (t) => ({
      bones: {
        spine: [0.05, s(t) * 0.2, s(t) * 0.12],
        chest: [0, s(t, 2) * 0.15, -s(t) * 0.1],
        head: [s(t, 4) * 0.1, -s(t) * 0.2, 0],
        upperArmL: [-1 - 0.6 * Math.max(0, s(t)), 0, 0.6 + 0.8 * Math.max(0, s(t))],
        upperArmR: [-1 - 0.6 * Math.max(0, -s(t)), 0, -0.6 - 0.8 * Math.max(0, -s(t))],
        lowerArmL: [-1.2 + 0.5 * s(t, 2), 0, 0],
        lowerArmR: [-1.2 - 0.5 * s(t, 2), 0, 0],
        upperLegL: [-0.3 * Math.max(0, s(t, 2)), 0, 0.1],
        upperLegR: [-0.3 * Math.max(0, -s(t, 2)), 0, -0.1],
        lowerLegL: [0.6 * Math.max(0, s(t, 2)), 0, 0],
        lowerLegR: [0.6 * Math.max(0, -s(t, 2)), 0, 0],
      },
      hips: [s(t) * 0.08, -0.04 + Math.abs(s(t, 2)) * 0.04, 0],
      morphs: { smile: 1 },
    }),
  },
  {
    id: "sitting",
    name: "Sitting",
    category: "basic",
    duration: 4,
    loop: true,
    description: "Seated pose (no chair geometry).",
    pose: (t) => ({
      bones: {
        spine: [-0.05 + 0.02 * s(t), 0, 0],
        upperLegL: [-1.55, 0, 0.08],
        upperLegR: [-1.55, 0, -0.08],
        lowerLegL: [1.55, 0, 0],
        lowerLegR: [1.55, 0, 0],
        upperArmL: [-0.5, 0, 0.12],
        upperArmR: [-0.5, 0, -0.12],
        lowerArmL: [-0.9, 0, 0],
        lowerArmR: [-0.9, 0, 0],
        head: [0.05, 0.15 * s(t, 0.5), 0],
      },
      hips: [0, -0.45, -0.05],
    }),
  },
  {
    id: "clapping",
    name: "Clapping",
    category: "basic",
    duration: 0.9,
    loop: true,
    description: "Enthusiastic applause.",
    pose: (t) => ({
      bones: {
        upperArmL: [-0.9, -0.6 - 0.35 * c(t, 2), 0.3],
        upperArmR: [-0.9, 0.6 + 0.35 * c(t, 2), -0.3],
        lowerArmL: [-1.2, 0, 0],
        lowerArmR: [-1.2, 0, 0],
        head: [0.05 * s(t, 2), 0, 0],
      },
      morphs: { smile: 1 },
    }),
  },
  {
    id: "pointing",
    name: "Pointing",
    category: "basic",
    duration: 2,
    loop: true,
    description: "Points forward with the right arm.",
    pose: (t) => ({
      bones: {
        ...ARMS_RELAXED,
        upperArmR: [-1.45 + 0.04 * s(t), 0.15, -0.1],
        lowerArmR: [-0.1, 0, 0],
        chest: [0, -0.15, 0],
        head: [0, -0.1, 0],
      },
    }),
  },
  {
    id: "talking",
    name: "Talking",
    category: "basic",
    duration: 3,
    loop: true,
    description: "Conversational gestures with mouth movement.",
    pose: (t) => ({
      bones: {
        upperArmL: [-0.35 - 0.15 * s(t, 2), 0, 0.15],
        upperArmR: [-0.35 - 0.15 * s(t, 1.5, 1), 0, -0.15],
        lowerArmL: [-1.1 - 0.2 * s(t, 3), -0.4, 0],
        lowerArmR: [-1.1 - 0.2 * s(t, 2, 2), 0.4, 0],
        head: [0.06 * s(t, 3), 0.12 * s(t), 0.04 * s(t, 2)],
        chest: [0, 0.05 * s(t), 0],
      },
      morphs: { open: Math.max(0, s(t, 9)) * 0.7 * (0.6 + 0.4 * s(t, 1.3)) },
    }),
  },
  {
    id: "laughing",
    name: "Laughing",
    category: "basic",
    duration: 1.6,
    loop: true,
    description: "Hearty laugh holding the belly.",
    pose: (t) => ({
      bones: {
        spine: [-0.15 + 0.05 * s(t, 6), 0, 0],
        chest: [-0.1 + 0.06 * s(t, 6), 0, 0],
        head: [-0.35 + 0.08 * s(t, 6), 0, 0],
        upperArmL: [-0.4, 0, 0.35],
        upperArmR: [-0.4, 0, -0.35],
        lowerArmL: [-1.6, 0, -0.5],
        lowerArmR: [-1.6, 0, 0.5],
      },
      morphs: { open: 0.6 + 0.3 * s(t, 6), smile: 1 },
    }),
  },
  {
    id: "thinking",
    name: "Thinking",
    category: "basic",
    duration: 4,
    loop: true,
    description: "Hand to chin, contemplative.",
    pose: (t) => ({
      bones: {
        upperArmL: [-0.55, 0, 0.25],
        lowerArmL: [-1.5, 0, -0.6],
        upperArmR: [-0.75, 0, 0.18],
        lowerArmR: [-2.25, 0, 0],
        handR: [0.3, 0, 0],
        head: [0.12, 0.2 + 0.08 * s(t), 0.12],
        spine: [0.04, 0, 0],
      },
    }),
  },
  {
    id: "greeting",
    name: "Greeting",
    category: "basic",
    duration: 3,
    loop: true,
    description: "A polite bow followed by a wave.",
    pose: (t) => {
      const bow = env(t, 0.02, 0.18, 0.32, 0.45);
      const wave = env(t, 0.45, 0.55, 0.92, 1);
      const w = wavePose(t * 3);
      const mix = (a: Euler3 = [0, 0, 0], k: number): Euler3 => [a[0] * k, a[1] * k, a[2] * k];
      return {
        bones: {
          ...ARMS_RELAXED,
          spine: [0.45 * bow, 0, 0],
          chest: [0.2 * bow, 0, 0],
          head: [0.25 * bow, 0, 0],
          upperArmR: mix(w.upperArmR, wave).map((v, i) => v + (i === 2 ? -0.08 * (1 - wave) : 0)) as Euler3,
          lowerArmR: mix(w.lowerArmR, wave),
        },
        morphs: { smile: 0.7 },
      };
    },
  },
  // ───────────── Sports ─────────────
  {
    id: "cricket_batting",
    name: "Cricket batting",
    category: "sports",
    duration: 1.8,
    loop: true,
    description: "Stance, back-lift and drive.",
    pose: (t) => {
      const back = env(t, 0.05, 0.3, 0.35, 0.45);
      const drive = env(t, 0.38, 0.55, 0.7, 0.95);
      return {
        bones: {
          spine: [0.3, 0.5 * back - 0.7 * drive, 0],
          chest: [0.1, 0.3 * back - 0.4 * drive, 0],
          head: [0.1, 0.6 - 0.3 * back, 0],
          upperArmL: [-0.8 + 0.3 * back - 0.8 * drive, -0.6, 0.2 + 0.8 * back],
          upperArmR: [-0.8 + 0.3 * back - 0.6 * drive, 0.6, -0.2 + 0.3 * back],
          lowerArmL: [-0.5, 0, 0],
          lowerArmR: [-0.9, 0, 0],
          upperLegL: [-0.5 * drive - 0.15, 0, 0.1],
          lowerLegL: [0.6 * drive + 0.2, 0, 0],
          upperLegR: [0.15, 0, -0.1],
          lowerLegR: [0.3, 0, 0],
        },
        hips: [0, -0.06, 0.05 * drive],
      };
    },
  },
  {
    id: "cricket_bowling",
    name: "Cricket bowling",
    category: "sports",
    duration: 1.8,
    loop: true,
    description: "Over-arm bowling action.",
    pose: (t) => {
      // One full revolution so the loop seam lines up (−2π ≡ 0).
      const arm = env(t, 0.25, 0.85, 2, 3) * -TAU;
      return {
        bones: {
          spine: [0.1 + 0.4 * env(t, 0.55, 0.7, 0.75, 0.95), -0.4 * env(t, 0.2, 0.4, 0.55, 0.7), 0],
          upperArmR: [arm, 0, -0.15],
          lowerArmR: [-0.1, 0, 0],
          upperArmL: [-2.4 * env(t, 0.1, 0.35, 0.45, 0.65), 0, 0.3],
          upperLegL: [-0.8 * env(t, 0.15, 0.4, 0.5, 0.7), 0, 0],
          lowerLegL: [0.6 * env(t, 0.15, 0.35, 0.45, 0.6), 0, 0],
          upperLegR: [0.5 * env(t, 0.55, 0.75, 0.8, 1), 0, 0],
          lowerLegR: [0.8 * env(t, 0.55, 0.75, 0.8, 1), 0, 0],
          head: [0, 0, 0],
        },
        hips: [0, 0.05 * env(t, 0.2, 0.4, 0.5, 0.7), 0],
      };
    },
  },
  {
    id: "football_kick",
    name: "Football kicking",
    category: "sports",
    duration: 1.3,
    loop: true,
    description: "Back-swing and right-foot strike.",
    pose: (t) => {
      const back = env(t, 0.05, 0.35, 0.38, 0.5);
      const kick = env(t, 0.4, 0.55, 0.6, 0.9);
      return {
        bones: {
          spine: [-0.15 * kick + 0.1 * back, 0, 0],
          upperLegR: [0.6 * back - 1.4 * kick, 0, 0],
          lowerLegR: [1.4 * back + 0.1 * kick, 0, 0],
          upperLegL: [-0.1, 0, 0],
          lowerLegL: [0.2, 0, 0],
          upperArmL: [-0.4 * kick, 0, 0.9],
          upperArmR: [0.4 * kick, 0, -0.9 * back - 0.4],
          head: [0.3, 0, 0],
        },
      };
    },
  },
  {
    id: "basketball_shot",
    name: "Basketball shooting",
    category: "sports",
    duration: 1.5,
    loop: true,
    description: "Dip, jump and release.",
    pose: (t) => {
      const dip = env(t, 0, 0.2, 0.25, 0.4);
      const up = env(t, 0.3, 0.5, 0.6, 0.85);
      return {
        bones: {
          upperLegL: [-0.7 * dip, 0, 0],
          upperLegR: [-0.7 * dip, 0, 0],
          lowerLegL: [1.2 * dip, 0, 0],
          lowerLegR: [1.2 * dip, 0, 0],
          upperArmR: [-1.4 - 1.3 * up, 0, -0.1],
          lowerArmR: [-1.6 * (1 - up) - 0.1, 0, 0],
          upperArmL: [-1.3 - 1.1 * up, 0, 0.25],
          lowerArmL: [-1.4 * (1 - up), 0, 0.3],
          head: [-0.25, 0, 0],
        },
        hips: [0, -0.2 * dip + 0.25 * up, 0],
      };
    },
  },
  {
    id: "tennis_swing",
    name: "Tennis swing",
    category: "sports",
    duration: 1.6,
    loop: true,
    description: "Forehand groundstroke.",
    pose: (t) => {
      const back = env(t, 0.05, 0.35, 0.4, 0.5);
      const fwd = env(t, 0.42, 0.6, 0.7, 0.95);
      return {
        bones: {
          spine: [0.2, -0.8 * back + 0.9 * fwd, 0],
          upperArmR: [-0.6 + 0.3 * back - 0.5 * fwd, 0.4, -1.1 * back - 0.4],
          lowerArmR: [-0.4, 0, 0],
          upperArmL: [-0.9 * back, 0, 0.6],
          lowerArmL: [-0.8, 0, 0],
          upperLegL: [-0.3, 0, 0.15],
          lowerLegL: [0.5, 0, 0],
          upperLegR: [0.1, 0, -0.15],
          lowerLegR: [0.4, 0, 0],
          head: [0.1, 0.4 * back - 0.2 * fwd, 0],
        },
        hips: [0, -0.08, 0],
      };
    },
  },
  {
    id: "pickleball_swing",
    name: "Pickleball swing",
    category: "sports",
    duration: 1.2,
    loop: true,
    description: "Compact underhand dink.",
    pose: (t) => {
      const sw = Math.sin(Math.PI * env(t, 0.1, 0.6, 0.6, 0.95));
      return {
        bones: {
          spine: [0.35, -0.2 + 0.4 * sw, 0],
          upperArmR: [0.4 - 1.1 * sw, 0, -0.25],
          lowerArmR: [-0.6, 0, 0],
          upperArmL: [-0.5, 0, 0.4],
          lowerArmL: [-1, 0, 0],
          upperLegL: [-0.6, 0, 0.15],
          upperLegR: [-0.4, 0, -0.15],
          lowerLegL: [0.9, 0, 0],
          lowerLegR: [0.8, 0, 0],
          head: [-0.1, 0, 0],
        },
        hips: [0, -0.15, 0],
      };
    },
  },
  // ───────────── Fun ─────────────
  {
    id: "superhero_pose",
    name: "Superhero pose",
    category: "fun",
    duration: 3,
    loop: true,
    description: "Fists on hips, chest out.",
    pose: (t) => ({
      bones: {
        upperArmL: [0.1, 0, 0.75],
        upperArmR: [0.1, 0, -0.75],
        lowerArmL: [-0.3, 0, -1.7],
        lowerArmR: [-0.3, 0, 1.7],
        chest: [-0.15 - 0.02 * s(t), 0, 0],
        head: [-0.15, 0.2, 0],
        upperLegL: [0, 0, 0.18],
        upperLegR: [0, 0, -0.18],
      },
      morphs: { smile: 0.5 },
    }),
  },
  {
    id: "robot_dance",
    name: "Robot dance",
    category: "fun",
    duration: 2.4,
    loop: true,
    description: "Stepped, mechanical moves.",
    pose: (t) => {
      const q = (v: number) => step(v, 3);
      return {
        bones: {
          upperArmL: [-1.4, 0, q(0.4 + 0.4 * s(t))],
          upperArmR: [-1.4, 0, -q(0.4 + 0.4 * s(t, 1, Math.PI))],
          lowerArmL: [-1.5 * q(0.5 + 0.5 * s(t, 2)), 0, 0],
          lowerArmR: [-1.5 * q(0.5 + 0.5 * c(t, 2)), 0, 0],
          head: [0, q(s(t)) * 0.5, 0],
          chest: [0, q(s(t, 0.5)) * 0.3, 0],
        },
        hips: [0, -0.03 * q(Math.abs(s(t, 2))), 0],
      };
    },
  },
  {
    id: "funny_walk",
    name: "Funny walking",
    category: "fun",
    duration: 1.2,
    loop: true,
    description: "High knees and flailing arms.",
    pose: (t) => {
      const p = walkCycle(t, 1.4);
      p.bones.upperLegL = [-Math.max(0, s(t)) * 1.4, 0, 0.1];
      p.bones.upperLegR = [-Math.max(0, -s(t)) * 1.4, 0, -0.1];
      p.bones.lowerLegL = [Math.max(0, s(t)) * 1.6, 0, 0];
      p.bones.lowerLegR = [Math.max(0, -s(t)) * 1.6, 0, 0];
      p.bones.upperArmL = [s(t, 2) * 0.6, 0, 1.2 + 0.4 * s(t)];
      p.bones.upperArmR = [-s(t, 2) * 0.6, 0, -1.2 + 0.4 * s(t)];
      p.bones.spine = [0.05, 0, s(t) * 0.15];
      p.bones.head = [0, 0, -s(t) * 0.25];
      p.morphs = { smile: 1, open: 0.3 };
      return p;
    },
  },
  {
    id: "celebration",
    name: "Celebration",
    category: "fun",
    duration: 1.2,
    loop: true,
    description: "Jumping fist pumps.",
    pose: (t) => ({
      bones: {
        upperArmL: [-0.3, 0, 2.5 + 0.2 * s(t, 2)],
        upperArmR: [-0.3, 0, -2.5 - 0.2 * s(t, 2)],
        lowerArmL: [0, 0, 0.4 + 0.3 * s(t, 2)],
        lowerArmR: [0, 0, -0.4 - 0.3 * s(t, 2)],
        head: [-0.25, 0, 0],
        upperLegL: [-0.3 * Math.max(0, -s(t)), 0, 0.05],
        upperLegR: [-0.3 * Math.max(0, -s(t)), 0, -0.05],
        lowerLegL: [0.6 * Math.max(0, -s(t)), 0, 0],
        lowerLegR: [0.6 * Math.max(0, -s(t)), 0, 0],
      },
      hips: [0, 0.15 * Math.max(0, s(t)), 0],
      morphs: { smile: 1, open: 0.5 },
    }),
  },
  {
    id: "victory_pose",
    name: "Victory pose",
    category: "fun",
    duration: 2.5,
    loop: true,
    description: "One fist raised to the sky.",
    pose: (t) => ({
      bones: {
        upperArmR: [-0.2, 0, -2.85 - 0.05 * s(t)],
        lowerArmR: [0, 0, -0.1],
        upperArmL: [0.1, 0, 0.75],
        lowerArmL: [-0.3, 0, -1.7],
        head: [-0.3, -0.15, 0],
        chest: [-0.1, 0, 0],
      },
      hips: [0, 0.01 * s(t, 2), 0],
      morphs: { smile: 1 },
    }),
  },
  {
    id: "moonwalk",
    name: "Moonwalk",
    category: "fun",
    duration: 1.4,
    loop: true,
    description: "The classic backwards glide (in place).",
    pose: (t) => {
      const a = s(t);
      return {
        bones: {
          upperLegL: [0.25 * a, 0, 0],
          upperLegR: [-0.25 * a, 0, 0],
          lowerLegL: [Math.max(0, a) * 0.7, 0, 0],
          lowerLegR: [Math.max(0, -a) * 0.7, 0, 0],
          footL: [-Math.max(0, a) * 0.6, 0, 0],
          footR: [-Math.max(0, -a) * 0.6, 0, 0],
          upperArmL: [-0.3 * a, 0, 0.15],
          upperArmR: [0.3 * a, 0, -0.15],
          lowerArmL: [-0.8, 0, 0],
          lowerArmR: [-0.8, 0, 0],
          spine: [0.1, 0, 0],
          head: [0, 0.3, 0],
        },
        hips: [0, 0.01 * Math.abs(a), 0],
      };
    },
  },
];

export const CLIP_MAP: Record<string, ClipDef> = Object.fromEntries(CLIPS.map((c) => [c.id, c]));
