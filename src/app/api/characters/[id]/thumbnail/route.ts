import { db, now } from "@/server/db";
import { handle, HttpError, requireUser } from "@/server/http";
import { ownedCharacter } from "@/server/services/characters";
import { storage } from "@/server/storage";
import { sniffImage } from "@/lib/imageFile";

// Thumbnails are rendered in the browser from the real 3D scene and uploaded here.
export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const c = await ownedCharacter(user.id, (await params).id);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength > 4 * 1024 * 1024 || sniffImage(bytes) !== "png") throw new HttpError(415, "Thumbnail must be a PNG under 4 MB");
  const key = await storage().put(`users/${user.id}/characters/${c.id}/thumbnail.png`, bytes, "image/png");
  await db().update("characters", c.id, { thumbnail_url: key, updated_at: now() });
  return Response.json({ ok: true });
});
