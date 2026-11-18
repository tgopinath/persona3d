import { db } from "@/server/db";
import { handle, requireUser } from "@/server/http";
import { ownedCharacter } from "@/server/services/characters";
import { storage } from "@/server/storage";

export const GET = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const c = await ownedCharacter(user.id, (await params).id);
  const rows = await db().find("animations", { character_id: c.id });
  return Response.json({
    animations: await Promise.all(rows.map(async (r) => ({ ...r, signed_url: r.animation_url ? await storage().signedUrl(r.animation_url) : null }))),
  });
});
