// Background job runner. Runs inside the Next.js process for local dev, or as
// a separate worker (`npm run worker`) in production. Jobs are leased so
// several workers never process the same job, and expired leases (crash,
// restart, refresh) are resumed from the last persisted stage.

import { db, now } from "../db";
import { runJob } from "./pipeline";

const LEASE_MS = 60_000;
const TICK_MS = 2_000;

const g = globalThis as unknown as { __persona3dRunner?: { timer: NodeJS.Timeout; active: Set<string> } };

async function tick(active: Set<string>) {
  const jobs = await db().findIn("generation_jobs", "job_status", ["queued", "processing"]);
  for (const job of jobs) {
    if (active.has(job.id)) continue;
    if (job.lease_until && new Date(job.lease_until).getTime() > Date.now()) continue;
    await db().update("generation_jobs", job.id, { lease_until: new Date(Date.now() + LEASE_MS).toISOString(), updated_at: now() });
    active.add(job.id);
    const renew = setInterval(() => {
      db().update("generation_jobs", job.id, { lease_until: new Date(Date.now() + LEASE_MS).toISOString() }).catch(() => undefined);
    }, LEASE_MS / 3);
    runJob(job.id)
      .catch((e) => console.error("[runner] job crashed", job.id, e))
      .finally(async () => {
        clearInterval(renew);
        active.delete(job.id);
        const j = await db().get("generation_jobs", job.id);
        if (j && !["queued", "processing"].includes(j.job_status)) await db().update("generation_jobs", job.id, { lease_until: null });
      });
  }
}

export function startRunner() {
  if (g.__persona3dRunner) return;
  const active = new Set<string>();
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    tick(active)
      .catch((e) => console.error("[runner]", e))
      .finally(() => (busy = false));
  }, TICK_MS);
  g.__persona3dRunner = { timer, active };
}

/** Kick the runner immediately (used right after a job is created). */
export function nudgeRunner() {
  startRunner();
}
