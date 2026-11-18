import { handle, requireUser } from "@/server/http";
import { CharacterLibrary, toView } from "@/server/services/characters";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const copy = await CharacterLibrary.duplicate(user.id, (await params).id);
  return Response.json({ character: await toView(copy) }, { status: 201 });
});
