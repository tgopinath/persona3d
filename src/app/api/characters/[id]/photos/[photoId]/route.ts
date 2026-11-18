import { handle, requireUser } from "@/server/http";
import { ownedCharacter } from "@/server/services/characters";
import { ImageUploadService } from "@/server/services/images";

export const DELETE = handle(async (req, { params }: { params: Promise<{ id: string; photoId: string }> }) => {
  const user = await requireUser(req);
  const { id, photoId } = await params;
  await ownedCharacter(user.id, id);
  await ImageUploadService.remove(id, photoId);
  return Response.json({ ok: true });
});
