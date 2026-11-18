"use client";

import { Pause, Play, Plus, Repeat, Sparkles, Square, X } from "lucide-react";
import { useRef, useState } from "react";
import { Studio, StudioHeader } from "@/components/StudioFrame";
import { CharacterStage } from "@/components/viewer/CharacterStage";
import { ViewerControls } from "@/components/viewer/ViewerControls";
import { useViewer } from "@/components/viewer/viewerStore";
import { Button, LinkButton, Pill, Slider, inputCls } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ClipEntry, LoadedModel } from "@/lib/client/modelRuntime";
import { CLIP_MAP } from "@/lib/animation/library";
import type { MotionPlan } from "@/lib/motionPrompt";

const CATS = [
  { id: "basic", label: "Basic" },
  { id: "sports", label: "Sports" },
  { id: "fun", label: "Fun" },
] as const;

const SOURCE_LABEL = { embedded: "In model", provider: "From rigging service", procedural: "Retargeted" };

/** Tiny glyph of a clip's motion: samples the right-hand path over one cycle. */
function MotionGlyph({ id }: { id: string }) {
  const def = CLIP_MAP[id];
  if (!def) return <div className="h-12" />;
  const pts = Array.from({ length: 24 }, (_, i) => {
    const p = def.pose(i / 24);
    const arm = p.bones.upperArmR ?? [0, 0, 0];
    const leg = p.bones.upperLegL ?? [0, 0, 0];
    const hips = p.hips ?? [0, 0, 0];
    return [i * 4 + 2, 24 - (arm[2] * -6 + arm[0] * -4) - leg[0] * -4 - hips[1] * 30];
  });
  return (
    <svg viewBox="0 0 98 48" className="h-12 w-full" aria-hidden>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="url(#mg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="mg">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="1" stopColor="#3fa9ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function AnimationStudio({ model, setModel, data }: { model: LoadedModel | null; setModel: (m: LoadedModel) => void; data: Parameters<Parameters<typeof Studio>[0]["children"]>[0] }) {
  const { clip, playing, speed, loop, sequence, sequenceIndex, set, play, playSequence } = useViewer();
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("basic");
  const [queue, setQueue] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<MotionPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const c = data.character;

  const clips = model ? [...model.clips.values()] : [];
  const inCat = clips.filter((x) => x.category === cat);
  const compatible = !!model && (model.rig.compatible || clips.length > 0);

  const runPrompt = async () => {
    setPlanning(true);
    setPlanError(null);
    try {
      const { plan } = await api<{ plan: MotionPlan }>("/api/motion", { method: "POST", json: { prompt } });
      const available = plan.steps.filter((s) => model?.clips.has(s.clip));
      setPlan({ ...plan, steps: available });
      if (available.length > 1) playSequence(available.map((s) => s.clip));
      else if (available[0]) play(available[0].clip);
    } catch (e) {
      setPlanError((e as Error).message);
    } finally {
      setPlanning(false);
    }
  };

  const ClipCard = ({ e }: { e: ClipEntry }) => {
    const on = clip === e.id && !sequence;
    return (
      <div className={`panel relative flex flex-col p-3 ${on ? "ring-2 ring-violet" : ""}`}>
        <button onClick={() => play(e.id)} className="text-left" aria-pressed={on}>
          <MotionGlyph id={e.id} />
          <span className="mt-1 block text-sm font-medium">{e.name}</span>
          <span className="block text-[12px] text-mist">
            {e.clip.duration.toFixed(1)}s, {SOURCE_LABEL[e.source]}
          </span>
        </button>
        <button onClick={() => setQueue((q) => [...q, e.id].slice(-8))} title="Add to sequence" aria-label={`Add ${e.name} to sequence`} className="absolute right-2 top-2 rounded-lg p-1 text-mist hover:bg-graphite hover:text-paper">
          <Plus className="size-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <StudioHeader character={c} title="Animation Studio">
        <LinkButton href={`/studio/export?c=${c.id}`}>Export animation</LinkButton>
      </StudioHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-3">
          <div ref={wrap} className="relative self-start">
            <CharacterStage url={c.model_signed_url} providerAnimations={data.providerAnimations} customisation={c.customisation} onLoaded={(m) => (setModel(m), data.onModelLoaded(m))} className="h-[60vh] min-h-[380px]" />
            <ViewerControls fullscreenTarget={wrap} />
          </div>
          <div className="panel flex flex-wrap items-center gap-3 p-3">
            <Button variant="primary" size="sm" onClick={() => set({ playing: !playing })} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
            <Button size="sm" aria-pressed={loop} onClick={() => set({ loop: !loop })} className={loop ? "ring-1 ring-violet" : ""}>
              <Repeat className="size-4" /> {loop ? "Looping" : "Play once"}
            </Button>
            <Button size="sm" onClick={() => play("idle")} disabled={!model?.clips.has("idle")}>
              <Square className="size-3.5" /> Return to idle
            </Button>
            <div className="min-w-[200px] flex-1">
              <Slider label="Speed" min={0.25} max={2} step={0.05} value={speed} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => set({ speed: v })} />
            </div>
          </div>
          {sequence && (
            <p className="text-[13px] text-mist">
              Playing sequence: {sequence.map((s, i) => (
                <span key={i} className={i === sequenceIndex ? "text-paper" : ""}>
                  {model?.clips.get(s)?.name ?? s}
                  {i < sequence.length - 1 ? " → " : ""}
                </span>
              ))}
            </p>
          )}
        </div>

        <aside className="space-y-4">
          {model && !compatible ? (
            <div className="panel p-5">
              <p className="font-medium">This model can&apos;t be animated</p>
              <p className="mt-1 text-sm text-mist">
                It has no humanoid skeleton we can drive{model.rig.missing.length ? ` (missing: ${model.rig.missing.slice(0, 5).join(", ")}…)` : ""}. Regenerate with a provider that supports auto-rigging, such as Meshy.
              </p>
            </div>
          ) : (
            <>
              <section className="panel p-4">
                <label htmlFor="motion-prompt" className="mb-2 flex items-center gap-2 text-sm">
                  <Sparkles className="size-4 text-violet" /> Describe a motion
                </label>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (prompt.trim()) runPrompt();
                  }}
                >
                  <input id="motion-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} className={inputCls} placeholder="Make my character walk towards the camera and wave" maxLength={300} />
                  <Button type="submit" variant="primary" loading={planning} disabled={!prompt.trim() || !model}>
                    Animate
                  </Button>
                </form>
                {planError && <p className="mt-2 text-[13px] text-bad">{planError}</p>}
                {plan && (
                  <div className="mt-3 rounded-xl bg-void/50 p-3 text-[13px]">
                    <Pill tone="warn">Preset match</Pill>
                    <p className="mt-2 text-mist">{plan.note}</p>
                  </div>
                )}
              </section>

              <section className="panel p-4">
                <div className="mb-3 flex gap-1.5" role="tablist">
                  {CATS.map((k) => (
                    <button key={k.id} role="tab" aria-selected={cat === k.id} onClick={() => setCat(k.id)} className={`h-8 rounded-full px-3 text-[13px] ${cat === k.id ? "bg-paper text-void" : "bg-graphite"}`}>
                      {k.label}
                      <span className="ml-1.5 opacity-60">{clips.filter((x) => x.category === k.id).length}</span>
                    </button>
                  ))}
                </div>
                <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-2">
                  {inCat.map((e) => (
                    <ClipCard key={e.id} e={e} />
                  ))}
                  {model && !inCat.length && <p className="col-span-full text-[13px] text-mist">No animations in this category for this rig.</p>}
                </div>
                {clips.some((x) => x.source === "procedural") && (
                  <p className="mt-3 text-[12.5px] text-mist">“Retargeted” clips are mapped onto this rig by bone name. On third-party rigs with different bone orientations they can look off.</p>
                )}
              </section>

              <section className="panel p-4">
                <p className="mb-2 text-sm">Sequence</p>
                {!queue.length ? (
                  <p className="text-[13px] text-mist">Use + on any animation to chain several together.</p>
                ) : (
                  <>
                    <ol className="flex flex-wrap gap-1.5">
                      {queue.map((q, i) => (
                        <li key={i} className="flex h-8 items-center gap-1 rounded-full bg-graphite pl-3 pr-1 text-[13px]">
                          {i + 1}. {model?.clips.get(q)?.name}
                          <button aria-label="Remove" onClick={() => setQueue((x) => x.filter((_, j) => j !== i))} className="rounded-full p-1 hover:bg-line">
                            <X className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="primary" onClick={() => playSequence(queue)}>
                        <Play className="size-3.5" /> Play sequence
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setQueue([])}>
                        Clear
                      </Button>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function AnimatePage() {
  const [model, setModel] = useState<LoadedModel | null>(null);
  return <Studio title="Animation Studio" path="/studio/animate">{(d) => <AnimationStudio model={model} setModel={setModel} data={d} />}</Studio>;
}
