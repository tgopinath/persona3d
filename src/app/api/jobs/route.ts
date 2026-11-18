import { db } from "@/server/db";
import { handle, requireUser } from "@/server/http";
import { startRunner } from "@/server/jobs/runner";
import { config } from "@/server/config";

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  if (config.inProcessWorker) startRunner();
  const character = new URL(req.url).searchParams.get("character");
  const jobs = (await db().find("generation_jobs", character ? { user_id: user.id, character_id: character } : { user_id: user.id }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
  return Response.json({ jobs });
});
