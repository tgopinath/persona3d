// Shared domain types used by both the client and the server.

export const ANGLES = [
  "front",
  "three_quarter_left",
  "left",
  "three_quarter_right",
  "right",
  "back",
] as const;
export type Angle = (typeof ANGLES)[number];

export const STYLE_IDS = [
  "realistic",
  "stylised",
  "cartoon",
  "anime",
  "low_poly",
  "game_ready",
  "miniature",
  "fantasy",
] as const;
export type StyleId = (typeof STYLE_IDS)[number];

export type Realism = "highly_realistic" | "semi_realistic" | "stylised" | "cartoon";
export type CharacterType = "full_body" | "upper_body" | "head";
export type BodyType = "slim" | "average" | "athletic" | "custom";
export type QualityPreset = "fast" | "balanced" | "high";

export type GenerationStatus = "draft" | "queued" | "processing" | "completed" | "failed" | "cancelled";
export type RigStatus = "none" | "pending" | "rigged" | "failed" | "unsupported";

export type StageId =
  | "analyse"
  | "appearance"
  | "geometry"
  | "texture"
  | "rig"
  | "animations"
  | "finalise";

export const STAGES: { id: StageId; label: string }[] = [
  { id: "analyse", label: "Analysing photographs" },
  { id: "appearance", label: "Understanding character appearance" },
  { id: "geometry", label: "Reconstructing 3D geometry" },
  { id: "texture", label: "Creating surface textures" },
  { id: "rig", label: "Building character skeleton" },
  { id: "animations", label: "Preparing animations" },
  { id: "finalise", label: "Finalising your character" },
];

export type StageState = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageRecord {
  state: StageState;
  /** Provider-reported progress 0-100, only when the provider exposes it. */
  progress?: number | null;
  /** Human readable note, e.g. "Included in Meshy reconstruction task". */
  note?: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface Proportions {
  height: number; // 0.85 - 1.15
  shoulders: number;
  hips: number;
  limbs: number;
  head: number;
}

export interface AppearanceHints {
  skin?: string;
  hair?: string;
  top?: string;
  bottom?: string;
  eyes?: string;
}

export interface GenerationSettings {
  style: StyleId;
  realism: Realism;
  characterType: CharacterType;
  bodyType: BodyType;
  proportions: Proportions;
  preserve: {
    hairstyle: boolean;
    facialHair: boolean;
    glasses: boolean;
    accessories: boolean;
    clothing: boolean;
  };
  description: string;
  preset: QualityPreset;
  meshQuality: "low" | "medium" | "high";
  textureResolution: 1024 | 2048 | 4096;
  removeBackground: boolean;
  faceDetail: "standard" | "high";
  bodyDetail: "standard" | "high";
  provider: string;
  /** Colours sampled from the user's photos (client-side analysis). */
  appearance: AppearanceHints;
}

export interface Customisation {
  colors: Record<string, string>; // material name -> hex
  accessories: Record<string, boolean>; // accessory node name -> visible
  morphs: Record<string, number>; // morph target name -> weight
  finish?: Record<string, number>; // material name -> roughness 0..1
  proportions?: Partial<Proportions>;
  outfit?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  created_at: string;
  allow_training: boolean;
  retention_days: number;
}

export interface CharacterRecord {
  id: string;
  user_id: string;
  name: string;
  style: StyleId;
  generation_status: GenerationStatus;
  model_url: string | null; // storage path
  thumbnail_url: string | null; // storage path
  texture_url: string | null; // storage path
  rig_status: RigStatus;
  provider: string | null;
  settings: GenerationSettings | null;
  customisation: Customisation | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CharacterPhotoRecord {
  id: string;
  character_id: string;
  angle: Angle;
  image_url: string; // storage path
  quality_status: string; // e.g. "excellent:95"
  created_at: string;
}

export interface AnimationRecord {
  id: string;
  character_id: string;
  animation_name: string;
  animation_url: string | null; // storage path of a separate GLB, or null if embedded in the model
  duration: number;
  source: "embedded" | "provider" | "procedural";
  created_at: string;
}

export interface GenerationJobRecord {
  id: string;
  user_id: string;
  character_id: string;
  provider: string;
  job_status: GenerationStatus;
  progress_stage: StageId | null;
  stages: Record<StageId, StageRecord>;
  provider_task_ids: Record<string, string>;
  error_message: string | null;
  cancel_requested: boolean;
  usage: { credits?: number; calls: number };
  /** Free-form pipeline metadata (e.g. whether textures came from the reconstruction task). */
  meta: Record<string, unknown>;
  /** Worker lease so only one worker processes a job; expired leases are picked up again. */
  lease_until: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ExportRecord {
  id: string;
  character_id: string;
  export_format: string;
  file_url: string; // storage path
  created_at: string;
}

/** Character as sent to the browser: storage paths swapped for signed URLs. */
export interface CharacterView extends CharacterRecord {
  model_signed_url: string | null;
  thumbnail_signed_url: string | null;
  animation_count: number;
  latest_job: GenerationJobRecord | null;
}

export interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  demo: boolean;
  capabilities: string[];
  maxImages: number;
  notes: string;
}
