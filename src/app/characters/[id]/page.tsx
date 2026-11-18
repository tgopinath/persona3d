"use client";

import { Check, Pencil } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { CharacterStage } from "@/components/viewer/CharacterStage";
import { LookPanel, ViewerControls } from "@/components/viewer/ViewerControls";
import { useViewer } from "@/components/viewer/viewerStore";
import { Button, ErrorNote, LinkButton, Pill, Spinner, StatusBadge, inputCls } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useAnimations, useAsync, useCharacter } from "@/lib/client/hooks";
import { renderThumbnail } from "@/lib/client/exporters";
import type { LoadedModel } from "@/lib/client/modelRuntime";
import { STYLES } from "@/lib/styles";
import { STAGES, type CharacterView, type GenerationJobRecord } from "@/lib/types";

const EXPRESSIONS = [
  { id: "neutral", label: "Neutral", morphs: {} },
  { id: "smile", label: "Smile", morphs: { smile: 1 } },
  { id: "surprised", label: "Surprised", morphs: { open: 0.8 } },
  { id: "sad", label: "Sad", morphs: { frown: 1 } },
];

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, loading, setData } = useCharacter(id);
  const anims = useAnimations(id);
  const jobs = useAsync(() => api<{ jobs: GenerationJobRecord[] }>(`/api/jobs?character=${id}`).then((r) => r.jobs), `jobs:${id}`);
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [expression, setExpression] = useState("neutral");
  const wrap = useRef<HTMLDivElement>(null);
  const thumbDone = useRef(false);
  const { set } = useViewer();

  if (loading && !data) return <Spinner label="Loading character" />;
  if (error || !data) return <ErrorNote>{error ?? "Character not found"}</ErrorNote>;
  const c = data.character;
  const style = STYLES.find((s) => s.id === c.style);

  const onLoaded = (m: LoadedModel) => {
    setModel(m);
    set({ clip: m.clips.has("idle") ? "idle" : null, loop: true, sequence: null });
    if (!c.thumbnail_url && !thumbDone.current) {
      thumbDone.current = true;
      setTimeout(async () => {
        const png = await renderThumbnail().catch(() => null);
        if (png) await api(`/api/characters/${c.id}/thumbnail`, { method: "POST", body: png, headers: { "Content-Type": "image/png" } }).catch(() => undefined);
      }, 1200);
    }
  };

  const setExpr = (e: (typeof EXPRESSIONS)[number]) => {
    setExpression(e.id);
    if (!model) return;
    for (const k of ["smile", "open", "frown"])
      for (const mesh of model.morphs.get(k) ?? []) mesh.morphTargetInfluences![mesh.morphTargetDictionary![k]] = (e.morphs as Record<string, number>)[k] ?? (k === "smile" ? 0.15 : 0);
  };

  const saveName = async () => {
    const r = await api<{ character: CharacterView }>(`/api/characters/${c.id}`, { method: "PATCH", json: { name } }).catch(() => null);
    if (r) setData((d) => (d ? { ...d, character: r.character } : d));
    setEditing(false);
  };

  const ready = c.generation_status === "completed" && c.model_signed_url;
  const hasExpressions = model && ["smile", "open", "frown"].some((k) => model.morphs.has(k));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveName();
              }}
            >
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} w-72 text-lg`} aria-label="Character name" maxLength={80} />
              <Button type="submit" size="sm" variant="primary" aria-label="Save name">
                <Check className="size-4" />
              </Button>
            </form>
          ) : (
            <h1 className="flex flex-wrap items-center gap-2 text-3xl font-bold md:text-4xl">
              {c.name}
              <button onClick={() => (setName(c.name), setEditing(true))} aria-label="Rename" className="rounded-lg p-1.5 text-mist hover:bg-graphite hover:text-paper">
                <Pencil className="size-4" />
              </button>
            </h1>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mist">
            <StatusBadge status={c.generation_status} />
            <span>{style?.name}</span>
            {c.is_demo && <Pill tone="warn">Demo character</Pill>}
            {c.rig_status === "rigged" ? <Pill tone="volt">Rigged</Pill> : <Pill>Not rigged</Pill>}
          </div>
        </div>
        {ready && (
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/studio/animate?c=${c.id}`} variant="primary">
              Animate
            </LinkButton>
            <LinkButton href={`/studio/customise?c=${c.id}`}>Customise</LinkButton>
            <LinkButton href={`/studio/export?c=${c.id}`}>Export</LinkButton>
          </div>
        )}
      </div>

      {!ready ? (
        <div className="panel p-6">
          <p className="text-mist">This character doesn&apos;t have a finished model yet.</p>
          <LinkButton href={`/create?c=${c.id}`} variant="primary" className="mt-3">
            Open generation
          </LinkButton>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div ref={wrap} className="relative self-start">
            <CharacterStage url={c.model_signed_url} providerAnimations={(anims.data ?? []).filter((a) => a.source === "provider" && a.signed_url).map((a) => ({ name: a.animation_name, url: a.signed_url! }))} customisation={c.customisation} onLoaded={onLoaded} className="h-[68vh] min-h-[420px]" />
            <ViewerControls fullscreenTarget={wrap} />
          </div>
          <aside className="space-y-4">
            <section className="panel p-5">
              <LookPanel />
            </section>
            <section className="panel p-5">
              <p className="mb-2 text-sm text-mist">Motion</p>
              <div className="flex flex-wrap gap-1.5">
                {(["idle", "standing", "waving", "talking"] as const)
                  .filter((k) => model?.clips.has(k))
                  .map((k) => (
                    <Button key={k} size="sm" onClick={() => set({ clip: k, sequence: null, loop: true })}>
                      {model?.clips.get(k)?.name}
                    </Button>
                  ))}
              </div>
              {model && !model.clips.size && <p className="text-[13px] text-mist">This model has no compatible skeleton, so it can be inspected but not animated.</p>}
              {hasExpressions ? (
                <>
                  <p className="mb-2 mt-4 text-sm text-mist">Expression</p>
                  <div className="flex flex-wrap gap-1.5">
                    {EXPRESSIONS.map((e) => (
                      <button key={e.id} onClick={() => setExpr(e)} aria-pressed={expression === e.id} className={`h-8 rounded-full px-3 text-[13px] ${expression === e.id ? "bg-paper text-void" : "bg-graphite"}`}>
                        {e.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[12.5px] text-mist">Blinking runs automatically. Expressions are overridden by animations that move the mouth.</p>
                </>
              ) : (
                model && <p className="mt-3 text-[12.5px] text-mist">This model has no facial morph targets, so expressions and blinking aren&apos;t available.</p>
              )}
            </section>
            {model && (
              <section className="panel p-5 text-[13px]">
                <p className="mb-2 text-sm text-mist">Model</p>
                <dl className="grid grid-cols-2 gap-y-1.5">
                  <dt className="text-mist">Triangles</dt>
                  <dd>{model.triangles.toLocaleString()}</dd>
                  <dt className="text-mist">Skeleton</dt>
                  <dd>{model.rig.compatible ? `Humanoid, ${model.rest.size > 0 ? Object.keys(model.rig.map).length : 0} mapped bones` : "Not compatible"}</dd>
                  <dt className="text-mist">Animations</dt>
                  <dd>{model.clips.size}</dd>
                  <dt className="text-mist">Materials</dt>
                  <dd>{model.materials.size}</dd>
                  <dt className="text-mist">Generated by</dt>
                  <dd>{c.provider}</dd>
                </dl>
              </section>
            )}
          </aside>
        </div>
      )}

      <section className="panel p-5">
        <h2 className="mb-3 text-lg font-semibold">Generation history</h2>
        {!jobs.data?.length ? (
          <p className="text-sm text-mist">No generations yet.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {jobs.data.map((j) => {
              const failed = STAGES.find((s) => j.stages[s.id]?.state === "failed");
              return (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="flex items-center gap-2">
                    <StatusBadge status={j.job_status} />
                    {new Date(j.created_at).toLocaleString()}
                    <span className="text-mist">via {j.provider}</span>
                  </span>
                  <span className="text-[13px] text-mist">
                    {failed ? `Stopped at: ${failed.label.toLowerCase()}` : j.completed_at ? `Finished in ${Math.max(1, Math.round((+new Date(j.completed_at) - +new Date(j.created_at)) / 1000))}s` : ""}
                    {j.usage?.calls ? `, ${j.usage.calls} provider calls` : ""}
                    {(j.job_status === "failed" || j.job_status === "cancelled") && (
                      <Link href={`/create?c=${c.id}`} className="ml-2 text-volt hover:underline">
                        Retry
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
