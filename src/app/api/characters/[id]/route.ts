import { db, now } from "@/server/db";
import { handle, HttpError, readJson, requireUser } from "@/server/http";
import { CharacterLibrary, ownedCharacter, toView } from "@/server/services/characters";
import { storage } from "@/server/storage";
import type { Customisation } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const c = await ownedCharacter(user.id, (await params).id);
  const photos = await db().find("character_photos", { character_id: c.id });
  return Response.json({
    character: await toView(c),
    photos: await Promise.all(photos.map(async (p) => ({ ...p, signed_url: await storage().signedUrl(p.image_url, 900) }))),
  });
});

export const PATCH = handle(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  const c = await ownedCharacter(user.id, (await params).id);
  const body = await readJson<{ name?: string; customisation?: Customisation }>(req);
  const patch: Record<string, unknown> = { updated_at: now() };
  if (typeof body.name === "string") {
    if (!body.name.trim()) throw new HttpError(400, "Name cannot be empty");
    patch.name = body.name.trim().slice(0, 80);
  }
  if (body.customisation) {
    const cu = body.customisation;
    const hex = /^#[0-9a-f]{6}$/i;
    patch.customisation = {
      colors: Object.fromEntries(Object.entries(cu.colors ?? {}).filter(([, v]) => hex.test(v)).slice(0, 40)),
      accessories: Object.fromEntries(Object.entries(cu.accessories ?? {}).map(([k, v]) => [k, !!v] as const).slice(0, 40)),
      morphs: Object.fromEntries(Object.entries(cu.morphs ?? {}).map(([k, v]) => [k, Math.max(0, Math.min(1, Number(v) || 0))] as const).slice(0, 40)),
      finish: Object.fromEntries(Object.entries(cu.finish ?? {}).map(([k, v]) => [k, Math.max(0, Math.min(1, Number(v) || 0))] as const).slice(0, 40)),
      proportions: cu.proportions && Object.fromEntries(Object.entries(cu.proportions).map(([k, v]) => [k, Math.max(0.8, Math.min(1.2, Number(v) || 1))])),
      outfit: cu.outfit?.slice(0, 40),
    } satisfies Customisation;
  }
  const updated = await db().update("characters", c.id, patch);
  return Response.json({ character: await toView(updated!) });
});

export const DELETE = handle(async (req, { params }: Ctx) => {
  const user = await requireUser(req);
  await CharacterLibrary.remove(user.id, (await params).id);
  return Response.json({ ok: true });
});
