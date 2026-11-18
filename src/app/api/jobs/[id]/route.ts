import { db } from "@/server/db";
import { handle, HttpError, requireUser } from "@/server/http";
import { startRunner } from "@/server/jobs/runner";
import { config } from "@/server/config";

export const GET = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  // Polling also (re)starts the in-process runner so jobs resume after a restart.
  if (config.inProcessWorker) startRunner();
  const job = await db().get("generation_jobs", (await params).id);
  if (!job || job.user_id !== user.id) throw new HttpError(404, "Job not found");
  return Response.json({ job });
});
