"use client";

import { create } from "zustand";
import type * as THREE from "three";
import type { LoadedModel } from "@/lib/client/modelRuntime";

export type Lighting = "studio" | "daylight" | "cinematic" | "portrait" | "dark";
export type Background = "gradient" | "grey" | "white" | "dark" | "transparent";
export type View = "front" | "side" | "rear" | "three_quarter" | "full" | "face" | "reset";

interface ViewerState {
  lighting: Lighting;
  background: Background;
  clip: string | null;
  playing: boolean;
  speed: number;
  loop: boolean;
  sequence: string[] | null;
  sequenceIndex: number;
  view: { name: View; nonce: number };
  lookAtCursor: boolean;
  autoRotate: boolean;
  set: (p: Partial<ViewerState>) => void;
  goTo: (v: View) => void;
  play: (clip: string) => void;
  playSequence: (clips: string[]) => void;
}

export const useViewer = create<ViewerState>((set) => ({
  lighting: "studio",
  background: "gradient",
  clip: null,
  playing: true,
  speed: 1,
  loop: true,
  sequence: null,
  sequenceIndex: 0,
  view: { name: "full", nonce: 0 },
  lookAtCursor: false,
  autoRotate: false,
  set: (p) => set(p),
  goTo: (name) => set((s) => ({ view: { name, nonce: s.view.nonce + 1 } })),
  play: (clip) => set({ clip, playing: true, sequence: null, sequenceIndex: 0 }),
  playSequence: (clips) => set({ sequence: clips, sequenceIndex: 0, clip: clips[0] ?? null, playing: true }),
}));

/** Imperative handles for exporters (renderer, scene, camera, model). */
export const runtime: {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  model: LoadedModel | null;
  /** When set, overrides model yaw (turntable rendering). */
  yaw: number | null;
  /** Render one frame synchronously (used by exporters). */
  renderNow: (() => void) | null;
} = { gl: null, scene: null, camera: null, model: null, yaw: null, renderNow: null };

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") (window as unknown as { __persona3d: typeof runtime }).__persona3d = runtime;
