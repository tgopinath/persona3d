import { config, isSharedPublicLocal, isSupabaseConfigured } from "./config";
import { db, now } from "./db";
import { serviceClient } from "./db/supabase";
import type { UserRecord } from "@/lib/types";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function handle<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
      console.error("[api]", e);
      return Response.json({ error: e instanceof Error ? e.message : "Unexpected server error" }, { status: 500 });
    }
  };
}

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Resolve the calling user.
 * - Supabase configured: verifies the Bearer access token with Supabase Auth.
 * - Local mode: a single local studio user (clearly shown in the UI).
 */
export async function requireUser(req: Request): Promise<UserRecord> {
  if (isSupabaseConfigured()) {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Sign in required", "auth_required");
    const { data, error } = await serviceClient().auth.getUser(token);
    if (error || !data.user) throw new HttpError(401, "Session expired — sign in again", "auth_required");
    const existing = await db().get("users", data.user.id);
    if (existing) return existing;
    return db().insert("users", {
      id: data.user.id,
      email: data.user.email ?? "",
      name: (data.user.user_metadata?.name as string) ?? data.user.email?.split("@")[0] ?? "Creator",
      created_at: now(),
      allow_training: false,
      retention_days: config.retentionDays,
    });
  }
  if (isSharedPublicLocal())
    throw new HttpError(
      503,
      "This public demo doesn't accept photos. Without accounts it would keep one shared studio, so your photos could be seen by other visitors. Run Persona3D on your own computer, or configure Supabase for private accounts.",
      "public_demo"
    );
  const existing = await db().get("users", LOCAL_USER_ID);
  if (existing) return existing;
  return db().insert("users", {
    id: LOCAL_USER_ID,
    email: "local@persona3d.localhost",
    name: "Local Studio",
    created_at: now(),
    allow_training: false,
    retention_days: config.retentionDays,
  });
}

// Simple fixed-window limiter (per process). Use an external store in multi-instance deployments.
const windows = new Map<string, { start: number; count: number }>();
export function rateLimit(key: string, limit = config.rateLimitPerMinute) {
  const t = Date.now();
  const w = windows.get(key);
  if (!w || t - w.start > 60_000) {
    windows.set(key, { start: t, count: 1 });
    return;
  }
  if (++w.count > limit) throw new HttpError(429, "Too many requests — please wait a minute and try again", "rate_limited");
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
