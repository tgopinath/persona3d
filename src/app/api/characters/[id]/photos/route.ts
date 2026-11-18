import { handle, HttpError, rateLimit, requireUser } from "@/server/http";
import { ownedCharacter } from "@/server/services/characters";
import { ImageUploadService } from "@/server/services/images";
import { storage } from "@/server/storage";
import type { Angle } from "@/lib/types";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  rateLimit(`upload:${user.id}`, 60);
  const c = await ownedCharacter(user.id, (await params).id);
  if (["queued", "processing"].includes(c.generation_status)) throw new HttpError(409, "Photos can't change while generating");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Missing file");
  if (form.get("ownership") !== "true") throw new HttpError(400, "Confirm you own or have permission to use this photo", "consent_required");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { row, width, height } = await ImageUploadService.upload(user.id, c.id, String(form.get("angle")) as Angle, bytes, String(form.get("quality") ?? ""), file.name);
  return Response.json({ photo: { ...row, signed_url: await storage().signedUrl(row.image_url, 900) }, width, height }, { status: 201 });
});
