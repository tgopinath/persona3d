"use client";

import { create } from "zustand";
import type { QualityReport } from "@/lib/imageQuality";
import type { Angle, GenerationSettings, QualityPreset } from "@/lib/types";

export interface PhotoSlot {
  preview: string;
  status: "analysing" | "uploading" | "uploaded" | "error";
  progress: number;
  report?: QualityReport;
  /** Grade/score restored from the server when resuming a draft. */
  savedQuality?: string;
  error?: string;
  photoId?: string;
  fileName?: string;
}

export const PRESETS: Record<QualityPreset, Pick<GenerationSettings, "meshQuality" | "textureResolution" | "faceDetail" | "bodyDetail">> = {
  fast: { meshQuality: "low", textureResolution: 1024, faceDetail: "standard", bodyDetail: "standard" },
  balanced: { meshQuality: "medium", textureResolution: 2048, faceDetail: "high", bodyDetail: "standard" },
  high: { meshQuality: "high", textureResolution: 4096, faceDetail: "high", bodyDetail: "high" },
};

export const defaultSettings = (provider: string): GenerationSettings => ({
  style: "stylised",
  realism: "stylised",
  characterType: "full_body",
  bodyType: "average",
  proportions: { height: 1, shoulders: 1, hips: 1, limbs: 1, head: 1 },
  preserve: { hairstyle: true, facialHair: true, glasses: true, accessories: true, clothing: true },
  description: "",
  preset: "balanced",
  ...PRESETS.balanced,
  removeBackground: true,
  provider,
  appearance: {},
});

interface WizardState {
  step: number;
  characterId: string | null;
  name: string;
  photos: Partial<Record<Angle, PhotoSlot>>;
  ownershipConfirmed: boolean;
  processingConsent: boolean;
  settings: GenerationSettings;
  jobId: string | null;
  set: (p: Partial<WizardState>) => void;
  setPhoto: (a: Angle, p: Partial<PhotoSlot> | null) => void;
  setSettings: (p: Partial<GenerationSettings>) => void;
  reset: (provider: string) => void;
}

export const useWizard = create<WizardState>((set) => ({
  step: 0,
  characterId: null,
  name: "",
  photos: {},
  ownershipConfirmed: false,
  processingConsent: false,
  settings: defaultSettings("demo"),
  jobId: null,
  set: (p) => set(p),
  setPhoto: (a, p) =>
    set((s) => {
      const photos = { ...s.photos };
      if (p === null) delete photos[a];
      else photos[a] = { ...(photos[a] ?? { preview: "", status: "analysing", progress: 0 }), ...p } as PhotoSlot;
      return { photos };
    }),
  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  reset: (provider) =>
    set({ step: 0, characterId: null, name: "", photos: {}, ownershipConfirmed: false, processingConsent: false, settings: defaultSettings(provider), jobId: null }),
}));
