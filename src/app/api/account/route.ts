import { db } from "@/server/db";
import { handle, HttpError, readJson, requireUser } from "@/server/http";
import { PrivacyService } from "@/server/services/characters";
import { isSupabaseConfigured } from "@/server/config";
import { serviceClient } from "@/server/db/supabase";

export const GET = handle(async (req) => Response.json({ user: await requireUser(req) }));

export const PATCH = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<{ name?: string; allow_training?: boolean; retention_days?: number }>(req);
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.slice(0, 80);
  if (typeof body.allow_training === "boolean") patch.allow_training = body.allow_training;
  if (body.retention_days !== undefined) {
    const d = Number(body.retention_days);
    if (![7, 30, 90, 365].includes(d)) throw new HttpError(400, "Retention must be 7, 30, 90 or 365 days");
    patch.retention_days = d;
  }
  const updated = await db().update("users", user.id, patch);
  const purged = patch.retention_days ? await PrivacyService.applyRetention(user.id, patch.retention_days as number) : 0;
  return Response.json({ user: updated, purged });
});

export const DELETE = handle(async (req) => {
  const user = await requireUser(req);
  const { confirm } = await readJson<{ confirm?: string }>(req);
  if (confirm !== "DELETE") throw new HttpError(400, 'Type "DELETE" to confirm');
  await PrivacyService.deleteAccountData(user.id);
  if (isSupabaseConfigured()) await serviceClient().auth.admin.deleteUser(user.id);
  return Response.json({ ok: true });
});
