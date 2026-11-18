import { db } from "@/server/db";
import { handle, HttpError, requireUser } from "@/server/http";
import { retryJob } from "@/server/jobs/pipeline";
import { startRunner } from "@/server/jobs/runner";
import { STAGES, type StageId } from "@/lib/types";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const job = await db().get("generation_jobs", (await params).id);
  if (!job || job.user_id !== user.id) throw new HttpError(404, "Job not found");
  if (!["failed", "cancelled"].includes(job.job_status)) throw new HttpError(409, "Only failed or cancelled jobs can be retried");
  const body = (await req.json().catch(() => ({}))) as { stage?: StageId };
  if (body.stage && !STAGES.some((s) => s.id === body.stage)) throw new HttpError(400, "Unknown stage");
  const updated = await retryJob(job, body.stage);
  startRunner();
  return Response.json({ job: updated });
});
