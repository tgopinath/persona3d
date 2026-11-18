// Server-only configuration. Never import this from client components.
import path from "node:path";

const env = process.env;

export const config = {
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  storageBucket: env.SUPABASE_STORAGE_BUCKET ?? "persona3d-private",

  meshyKey: env.MESHY_API_KEY ?? "",
  meshyBase: env.MESHY_API_BASE ?? "https://api.meshy.ai",
  tripoKey: env.TRIPO_API_KEY ?? "",
  tripoBase: env.TRIPO_API_BASE ?? "https://api.tripo3d.ai",

  defaultProvider: env.PERSONA3D_PROVIDER ?? "",
  maxUploadMb: Number(env.PERSONA3D_MAX_UPLOAD_MB ?? 15),
  /** Pacing between demo stages so progress is observable. Labelled as such in the UI. */
  demoStageDelayMs: Number(env.PERSONA3D_DEMO_STAGE_DELAY_MS ?? 700),
  dataDir: env.PERSONA3D_DATA_DIR ?? path.join(process.cwd(), ".data"),
  signingSecret: env.PERSONA3D_SIGNING_SECRET ?? "dev-only-insecure-secret-change-me",
  /** Run the job runner inside the Next.js process (local dev). Set false when a separate worker runs. */
  inProcessWorker: (env.PERSONA3D_IN_PROCESS_WORKER ?? "true") !== "false",
  rateLimitPerMinute: Number(env.PERSONA3D_RATE_LIMIT_PER_MIN ?? 30),
  retentionDays: Number(env.PERSONA3D_RETENTION_DAYS ?? 30),
};

export const isSupabaseConfigured = () => !!(config.supabaseUrl && config.supabaseServiceKey);

/**
 * Local mode keeps one shared studio, so on a public host (Vercel, or PERSONA3D_PUBLIC_DEMO=true)
 * every visitor would see everyone else's photos. There the server refuses photos and characters
 * unless Supabase (private per-user accounts) is configured. PERSONA3D_ALLOW_SHARED_LOCAL=true
 * overrides this for a private, password-protected deployment.
 */
export const isSharedPublicLocal = () =>
  !isSupabaseConfigured() &&
  (!!env.VERCEL || env.PERSONA3D_PUBLIC_DEMO === "true") &&
  env.PERSONA3D_ALLOW_SHARED_LOCAL !== "true";
