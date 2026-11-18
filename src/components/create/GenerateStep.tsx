"use client";

import { Check, CircleAlert, Loader2, Minus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { useJob } from "@/lib/client/hooks";
import { STAGES, type CharacterView, type GenerationJobRecord, type StageId } from "@/lib/types";
import { CharacterStage } from "../viewer/CharacterStage";
import { Button, ErrorNote, LinkButton, Pill } from "../ui";

function StageRow({ id, label, job }: { id: StageId; label: string; job: GenerationJobRecord }) {
  const s = job.stages[id];
  const icon =
    s.state === "done" ? (
      <Check className="size-4 text-ok" />
    ) : s.state === "running" ? (
      <Loader2 className="size-4 animate-spin text-volt" />
    ) : s.state === "failed" ? (
      <CircleAlert className="size-4 text-bad" />
    ) : s.state === "skipped" ? (
      <Minus className="size-4 text-mist" />
    ) : (
      <span className="size-2 rounded-full bg-line" />
    );
  return (
    <li className="flex gap-3 py-2.5" aria-current={s.state === "running" ? "step" : undefined}>
      <span className="mt-0.5 grid size-5 place-items-center">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${s.state === "pending" ? "text-mist" : ""}`}>{label}</p>
        {s.state === "running" && typeof s.progress === "number" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-line">
              <div className="h-1 rounded-full bg-gradient-to-r from-violet to-volt transition-[width] duration-700" style={{ width: `${s.progress}%` }} />
            </div>
            <span className="text-[12px] tabular-nums text-mist">{s.progress}%</span>
          </div>
        )}
        {s.note && <p className="mt-0.5 text-[12.5px] text-mist">{s.note}</p>}
        {s.error && <p className="mt-0.5 text-[12.5px] text-bad">{s.error}</p>}
      </div>
    </li>
  );
}

export function GenerateStep({ jobId, characterId, onRestart }: { jobId: string; characterId: string; onRestart: () => void }) {
  const [character, setCharacter] = useState<CharacterView | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restart, setRestart] = useState(0);
  const { job, setJob, error } = useJob(jobId, async (j) => {
    if (j.job_status === "completed" || j.job_status === "failed") {
      const r = await api<{ character: CharacterView }>(`/api/characters/${characterId}`).catch(() => null);
      if (r) setCharacter(r.character);
    }
  }, restart);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!job) return error ? <ErrorNote>{error}</ErrorNote> : <p className="text-mist">Connecting to your generation…</p>;
  const running = ["queued", "processing"].includes(job.job_status);
  const failedStage = STAGES.find((s) => job.stages[s.id].state === "failed");
  const isDemo = job.provider === "demo";

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="panel p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{job.job_status === "completed" ? "Your character is ready" : job.job_status === "failed" ? "Generation stopped" : job.job_status === "cancelled" ? "Generation cancelled" : job.job_status === "queued" ? "Waiting for a worker" : "Building your character"}</h2>
          {isDemo && <Pill tone="warn">Demo provider</Pill>}
        </div>
        {isDemo && <p className="mb-2 text-[12.5px] text-mist">Demo mode builds a parametric character tinted from your photos. Stages are paced slightly so you can follow them.</p>}
        <ol className="divide-y divide-line/60">
          {STAGES.map((s) => (
            <StageRow key={s.id} id={s.id} label={s.label} job={job} />
          ))}
        </ol>
        {job.error_message && <p className="mt-3 rounded-xl bg-bad/10 p-3 text-[13px] text-bad">{job.error_message}</p>}
        {actionError && <p className="mt-3 text-[13px] text-bad">{actionError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {running && (
            <Button variant="danger" loading={busy} onClick={() => act(async () => void (await api(`/api/jobs/${job.id}/cancel`, { method: "POST" })))}>
              Cancel generation
            </Button>
          )}
          {(job.job_status === "failed" || job.job_status === "cancelled") && (
            <>
              <Button
                variant="primary"
                loading={busy}
                onClick={() =>
                  act(async () => {
                    const r = await api<{ job: GenerationJobRecord }>(`/api/jobs/${job.id}/retry`, { method: "POST", json: {} });
                    setJob(r.job);
                    setRestart((n) => n + 1);
                  })
                }
              >
                <RotateCcw className="size-4" /> {failedStage ? `Retry from “${failedStage.label.toLowerCase()}”` : "Resume"}
              </Button>
              <Button variant="ghost" onClick={onRestart}>
                Change settings
              </Button>
            </>
          )}
        </div>
        <p className="mt-4 text-[12.5px] text-mist">You can leave this page. Generation continues on the server and you can come back from My Characters.</p>
      </section>

      <section>
        {character?.model_signed_url ? (
          <div className="space-y-3">
            <CharacterStage url={character.model_signed_url} className="h-[62vh] min-h-[380px]" />
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/characters/${character.id}`} variant="primary">
                Open in viewer
              </LinkButton>
              <LinkButton href={`/studio/animate?c=${character.id}`}>Animate</LinkButton>
              <LinkButton href={`/studio/customise?c=${character.id}`}>Customise</LinkButton>
              <LinkButton href={`/studio/export?c=${character.id}`}>Export</LinkButton>
            </div>
          </div>
        ) : (
          <div className="stage grid h-[62vh] min-h-[380px] place-items-center">
            <p className="max-w-xs text-center text-sm text-mist">{running ? "Your 3D character will appear here as soon as the model is ready." : "No model was produced."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
