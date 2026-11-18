import { db, now } from "@/server/db";
import { handle, HttpError, requireUser } from "@/server/http";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  const job = await db().get("generation_jobs", (await params).id);
  if (!job || job.user_id !== user.id) throw new HttpError(404, "Job not found");
  if (!["queued", "processing"].includes(job.job_status)) throw new HttpError(409, "Job is not running");
  if (job.job_status === "queued" && !job.lease_until) {
    // Not picked up by a worker yet — cancel immediately.
    await db().update("generation_jobs", job.id, { cancel_requested: true, job_status: "cancelled", updated_at: now() });
    await db().update("characters", job.character_id, { generation_status: "cancelled", updated_at: now() });
  } else await db().update("generation_jobs", job.id, { cancel_requested: true, updated_at: now() });
  return Response.json({ ok: true });
});
