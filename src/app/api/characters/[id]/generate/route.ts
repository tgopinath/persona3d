import { handle, HttpError, rateLimit, readJson, requireUser } from "@/server/http";
import { CharacterLibrary } from "@/server/services/characters";
import { STYLE_IDS, type GenerationSettings } from "@/lib/types";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  rateLimit(`generate:${user.id}`, 6);
  const { settings, consent } = await readJson<{ settings: GenerationSettings; consent: boolean }>(req);
  if (!settings || !STYLE_IDS.includes(settings.style)) throw new HttpError(400, "Invalid generation settings");
  settings.description = String(settings.description ?? "").slice(0, 600);
  const job = await CharacterLibrary.startGeneration(user.id, (await params).id, settings, !!consent);
  return Response.json({ job }, { status: 202 });
});
