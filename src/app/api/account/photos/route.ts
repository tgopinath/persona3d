import { handle, requireUser } from "@/server/http";
import { PrivacyService } from "@/server/services/characters";

export const DELETE = handle(async (req) => {
  const user = await requireUser(req);
  return Response.json({ deleted: await PrivacyService.deleteAllPhotos(user.id) });
});
