"use client";

import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ConfigStep } from "@/components/create/ConfigStep";
import { GenerateStep } from "@/components/create/GenerateStep";
import { QualityStep } from "@/components/create/QualityStep";
import { SettingsStep } from "@/components/create/SettingsStep";
import { StyleStep } from "@/components/create/StyleStep";
import { UploadStep } from "@/components/create/UploadStep";
import { defaultSettings, useWizard } from "@/components/create/wizardStore";
import { Button, EmptyState, ErrorNote, LinkButton, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useConfig, type PhotoWithUrl } from "@/lib/client/hooks";
import { mergeAppearance } from "@/lib/imageQuality";
import type { CharacterView, GenerationJobRecord } from "@/lib/types";

const STEPS = [
  { title: "Upload Your Photos", body: "Upload photographs of the same person from different angles to create a consistent 3D character." },
  { title: "Check photo quality", body: "We look at each photo before anything is sent for generation." },
  { title: "Choose a style", body: "Pick how your character should look. You can generate again in another style later." },
  { title: "Configure your character", body: "Body type, what to keep from the photos, and a name." },
  { title: "Generation settings", body: "Trade speed for detail and choose which service builds the model." },
  { title: "Generate", body: "" },
];

function Wizard() {
  const cfg = useConfig();
  const params = useSearchParams();
  const resumeId = params.get("c");
  const w = useWizard();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fresh start or resume a draft / running job after a refresh.
  useEffect(() => {
    if (!cfg) return;
    const s = useWizard.getState();
    if (!resumeId) {
      if (s.characterId) s.reset(cfg.defaultProvider);
      else s.setSettings({ provider: cfg.defaultProvider });
      return;
    }
    if (s.characterId === resumeId) return;
    (async () => {
      try {
        const { character, photos } = await api<{ character: CharacterView; photos: PhotoWithUrl[] }>(`/api/characters/${resumeId}`);
        s.reset(cfg.defaultProvider);
        const slots = Object.fromEntries(photos.map((p) => [p.angle, { preview: p.signed_url, status: "uploaded" as const, progress: 1, savedQuality: p.quality_status, photoId: p.id }]));
        const job = character.latest_job;
        useWizard.getState().set({
          characterId: character.id,
          name: character.name,
          photos: slots,
          ownershipConfirmed: photos.length > 0,
          settings: { ...defaultSettings(cfg.defaultProvider), ...(character.settings ?? {}) },
          jobId: job?.id ?? null,
          step: job && job.job_status !== "draft" ? 5 : photos.length ? 1 : 0,
        });
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
  }, [cfg, resumeId]);

  if (loadError) return <ErrorNote>{loadError}</ErrorNote>;
  // Resuming: wait until the draft has been loaded into the wizard store.
  if (cfg?.publicDemo)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState
          title="Photo upload is off in this public demo"
          body="Persona3D only takes photos when they stay private: on your own computer (local mode) or with personal accounts (Supabase). This shared demo has neither, so it accepts no photos. You can still explore the sample character, built entirely in your browser."
          action={<LinkButton href="/" variant="primary">View the sample character</LinkButton>}
        />
      </div>
    );
  if (!cfg || (resumeId && w.characterId !== resumeId)) return <Spinner label="Preparing the studio" />;

  const uploaded = Object.values(w.photos).filter((p) => p?.status === "uploaded").length;
  const busy = Object.values(w.photos).some((p) => p?.status === "analysing" || p?.status === "uploading");
  const canNext = [uploaded > 0 && !busy, true, true, true, w.processingConsent][w.step] ?? false;

  const generate = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const reports = Object.entries(w.photos)
        .filter(([, p]) => p?.report)
        .map(([angle, p]) => ({ angle: angle as never, report: p!.report! }));
      const appearance = reports.length ? mergeAppearance(reports) : w.settings.appearance;
      if (w.name.trim()) await api(`/api/characters/${w.characterId}`, { method: "PATCH", json: { name: w.name.trim() } });
      const { job } = await api<{ job: GenerationJobRecord }>(`/api/characters/${w.characterId}/generate`, {
        method: "POST",
        json: { settings: { ...w.settings, appearance }, consent: w.processingConsent },
      });
      w.set({ jobId: job.id, step: 5 });
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const step = STEPS[w.step];
  return (
    <div className="space-y-6">
      <nav aria-label="Creation steps" className="flex gap-1.5 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            disabled={i > w.step || w.step === 5}
            onClick={() => w.set({ step: i })}
            aria-current={i === w.step ? "step" : undefined}
            className={`flex h-8 shrink-0 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] transition-colors ${i === w.step ? "bg-graphite text-paper" : i < w.step ? "text-paper hover:bg-graphite" : "text-mist/60"}`}
          >
            <span className={`grid size-6 place-items-center rounded-full text-[11px] ${i < w.step ? "bg-violet text-void" : i === w.step ? "bg-paper text-void" : "bg-line"}`}>{i + 1}</span>
            {["Photos", "Quality", "Style", "Details", "Settings", "Generate"][i]}
          </button>
        ))}
      </nav>

      {w.step < 5 && (
        <header>
          <h1 className="text-3xl font-bold md:text-4xl">{step.title}</h1>
          <p className="mt-1 max-w-prose text-mist">{step.body}</p>
        </header>
      )}

      {w.step === 0 && <UploadStep maxMb={cfg.maxUploadMb} />}
      {w.step === 1 && <QualityStep characterType={w.settings.characterType} />}
      {w.step === 2 && <StyleStep />}
      {w.step === 3 && <ConfigStep />}
      {w.step === 4 && <SettingsStep providers={cfg.providers} />}
      {w.step === 5 && w.jobId && w.characterId && <GenerateStep jobId={w.jobId} characterId={w.characterId} onRestart={() => w.set({ step: 4, jobId: null })} />}

      {w.step < 5 && (
        <footer className="sticky bottom-20 z-20 flex items-center justify-between gap-3 rounded-full bg-charcoal/95 p-2 backdrop-blur md:bottom-4">
          <Button variant="ghost" disabled={w.step === 0} onClick={() => w.set({ step: w.step - 1 })}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          {submitError && <span className="truncate text-[13px] text-bad">{submitError}</span>}
          {w.step < 4 ? (
            <Button variant="primary" disabled={!canNext} onClick={() => w.set({ step: w.step + 1 })}>
              {w.step === 0 && uploaded === 0 ? "Upload at least one photo" : "Continue"}
            </Button>
          ) : (
            <Button variant="primary" size="lg" disabled={!canNext} loading={submitting} onClick={generate}>
              Generate My 3D Character
            </Button>
          )}
        </footer>
      )}
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense fallback={<Spinner label="Preparing the studio" />}>
      <Wizard />
    </Suspense>
  );
}
