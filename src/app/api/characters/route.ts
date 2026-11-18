import { handle, rateLimit, readJson, requireUser } from "@/server/http";
import { CharacterLibrary, toView } from "@/server/services/characters";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return Response.json({ characters: await CharacterLibrary.list(user.id) });
});

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  rateLimit(`create:${user.id}`, 20);
  const { name } = await readJson<{ name?: string }>(req);
  return Response.json({ character: await toView(await CharacterLibrary.createDraft(user.id, name ?? "")) }, { status: 201 });
});
