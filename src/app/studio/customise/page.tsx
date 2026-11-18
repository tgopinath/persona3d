"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Studio, StudioHeader, type StudioData } from "@/components/StudioFrame";
import { CharacterStage } from "@/components/viewer/CharacterStage";
import { ViewerControls } from "@/components/viewer/ViewerControls";
import { useViewer } from "@/components/viewer/viewerStore";
import { Button, Slider, Toggle } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { LoadedModel } from "@/lib/client/modelRuntime";
import type { CharacterView, Customisation } from "@/lib/types";

const MATERIAL_LABEL: Record<string, string> = { Skin: "Skin tone", Hair: "Hair colour", Eyes: "Eye colour", Top: "Top", Bottom: "Trousers", Shoes: "Shoes", Accessory: "Glasses and cap", Cape: "Cape" };
const FACE_MATERIALS = ["Hair", "Eyes"];
const ACCESSORY_LABEL: Record<string, string> = { glasses: "Glasses", cap: "Cap", beard: "Beard", tie: "Tie", cape: "Cape", visor: "Visor", ears: "Elf ears", headband: "Headband", backpack: "Backpack", crown: "Crown" };
const FACE_ACCESSORIES = ["glasses", "beard", "cap", "visor", "ears", "headband", "crown"];
const SWATCHES = { Hair: ["#1b120d", "#3b2417", "#7a4a26", "#c8a165", "#e8e1d6", "#8b1e3f", "#3a57c4"], Eyes: ["#3a2a1e", "#5b3b1f", "#3d6b8a", "#4f7a43", "#6b6f74"] };

interface Outfit {
  id: string;
  name: string;
  colors: Record<string, string>;
  accessories: Record<string, boolean>;
}
const OUTFITS: Outfit[] = [
  { id: "casual", name: "Casual", colors: { Top: "#3e6fd8", Bottom: "#2b3445", Shoes: "#e9e9ee" }, accessories: { tie: false, cape: false, visor: false, headband: false, crown: false, backpack: false } },
  { id: "formal", name: "Formal", colors: { Top: "#1d2230", Bottom: "#161a24", Shoes: "#0d0d10" }, accessories: { tie: true, cape: false, visor: false, headband: false, cap: false, crown: false, backpack: false } },
  { id: "sport", name: "Sportswear", colors: { Top: "#ef4444", Bottom: "#111827", Shoes: "#f8fafc" }, accessories: { headband: true, tie: false, cape: false, visor: false, crown: false } },
  { id: "traditional", name: "Traditional", colors: { Top: "#f1e3c6", Bottom: "#f8f5ee", Shoes: "#6b3e1f" }, accessories: { tie: false, cape: false, visor: false, headband: false, cap: false, crown: false } },
  { id: "fantasy", name: "Fantasy", colors: { Top: "#2f5e3a", Bottom: "#3b2a1e", Shoes: "#3b2a1e", Cape: "#7c3aed" }, accessories: { cape: true, ears: true, crown: true, tie: false, visor: false, cap: false } },
  { id: "future", name: "Futuristic", colors: { Top: "#d9e1ea", Bottom: "#26313f", Shoes: "#38bdf8" }, accessories: { visor: true, tie: false, cape: false, crown: false, ears: false, cap: false } },
];

function ColorRow({ name, value, onChange, swatches }: { name: string; value: string; onChange: (v: string) => void; swatches?: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm">{MATERIAL_LABEL[name] ?? name}</span>
      <span className="flex items-center gap-1.5">
        {swatches?.map((s) => (
          <button key={s} aria-label={`${MATERIAL_LABEL[name] ?? name} ${s}`} onClick={() => onChange(s)} className={`size-6 rounded-full ring-offset-2 ring-offset-charcoal ${value === s ? "ring-2 ring-paper" : ""}`} style={{ background: s }} />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${MATERIAL_LABEL[name] ?? name} custom colour`} className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0" />
      </span>
    </div>
  );
}

function Customiser({ data }: { data: StudioData }) {
  const c = data.character;
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [cust, setCust] = useState<Customisation>(c.customisation ?? { colors: {}, accessories: {}, morphs: {} });
  const [tab, setTab] = useState<"face" | "body" | "clothing">("face");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const set = useViewer((s) => s.set);
  useEffect(() => set({ clip: "idle", sequence: null, loop: true }), [set]);

  const color = (name: string) => cust.colors[name] ?? model?.materialDefaults.get(name) ?? "#888888";
  const acc = (id: string) => cust.accessories[id] ?? model?.accessoryDefaults.get(id) ?? false;
  const update = (p: Partial<Customisation>) => {
    setSaved(null);
    setCust((x) => ({ ...x, ...p }));
  };
  const dirty = useMemo(() => JSON.stringify(cust) !== JSON.stringify(c.customisation ?? { colors: {}, accessories: {}, morphs: {} }), [cust, c.customisation]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await api<{ character: CharacterView }>(`/api/characters/${c.id}`, { method: "PATCH", json: { customisation: cust } });
      data.setCharacter(r.character);
      setSaved("Changes saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const mats = model ? [...model.materials.keys()] : [];
  const accs = model ? [...model.accessories.keys()] : [];
  const expressive = model ? ["smile", "frown", "open"].filter((k) => model.morphs.has(k)) : [];
  const unsupported = [
    "Hairstyle",
    "Beard style",
    "Eyebrow style",
    ...(model?.head ? [] : ["Head size"]),
    ...(mats.includes("Shoes") ? [] : ["Shoe colour"]),
    ...(accs.length ? [] : ["Accessories"]),
  ];

  return (
    <div className="space-y-5">
      <StudioHeader character={c} title="Customisation">
        <Button variant="ghost" disabled={!dirty} onClick={() => setCust(c.customisation ?? { colors: {}, accessories: {}, morphs: {} })}>
          Discard changes
        </Button>
        <Button variant="ghost" onClick={() => update({ colors: {}, accessories: {}, morphs: {}, finish: {}, proportions: {}, outfit: undefined })}>
          Reset to generated
        </Button>
        <Button variant="primary" disabled={!dirty} loading={saving} onClick={save}>
          Save changes
        </Button>
      </StudioHeader>
      {(saved || error) && <p className={`text-sm ${error ? "text-bad" : "text-ok"}`}>{error ?? saved}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div ref={wrap} className="relative self-start">
          <CharacterStage url={c.model_signed_url} providerAnimations={data.providerAnimations} customisation={cust} onLoaded={(m) => (setModel(m), data.onModelLoaded(m))} className="h-[68vh] min-h-[400px]" />
          <ViewerControls fullscreenTarget={wrap} />
        </div>
        <aside className="panel space-y-4 p-5">
          <div role="tablist" className="flex gap-1.5">
            {(["face", "body", "clothing"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`h-8 rounded-full px-3 text-[13px] capitalize ${tab === t ? "bg-paper text-void" : "bg-graphite"}`}>
                {t}
              </button>
            ))}
          </div>

          {!model && <p className="text-sm text-mist">Loading the model&apos;s editable parts…</p>}

          {model && tab === "face" && (
            <div className="divide-y divide-line/60">
              <div className="pb-3">
                {mats.filter((m) => FACE_MATERIALS.includes(m)).map((m) => (
                  <ColorRow key={m} name={m} value={color(m)} swatches={SWATCHES[m as keyof typeof SWATCHES]} onChange={(v) => update({ colors: { ...cust.colors, [m]: v } })} />
                ))}
              </div>
              {expressive.length > 0 && (
                <div className="py-3">
                  <p className="mb-1 text-sm text-mist">Facial expression</p>
                  {expressive.map((k) => (
                    <Slider key={k} label={{ smile: "Smile", frown: "Frown", open: "Mouth open" }[k]!} min={0} max={1} step={0.05} value={cust.morphs[k] ?? (k === "smile" ? 0.15 : 0)} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update({ morphs: { ...cust.morphs, [k]: v } })} />
                  ))}
                </div>
              )}
              {accs.some((a) => FACE_ACCESSORIES.includes(a)) && (
                <div className="pt-3">
                  {accs.filter((a) => FACE_ACCESSORIES.includes(a)).map((a) => (
                    <Toggle key={a} label={ACCESSORY_LABEL[a] ?? a} checked={acc(a)} onChange={(v) => update({ accessories: { ...cust.accessories, [a]: v } })} />
                  ))}
                </div>
              )}
            </div>
          )}

          {model && tab === "body" && (
            <div className="divide-y divide-line/60">
              <div className="pb-3">
                <Slider label="Height" min={0.85} max={1.15} step={0.01} value={cust.proportions?.height ?? 1} format={(v) => `${Math.round(v * 170)} cm`} onChange={(v) => update({ proportions: { ...cust.proportions, height: v } })} />
                {model.head && <Slider label="Head size" min={0.85} max={1.15} step={0.01} value={cust.proportions?.head ?? 1} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => update({ proportions: { ...cust.proportions, head: v } })} />}
              </div>
              {mats.includes("Skin") && (
                <div className="py-3">
                  <ColorRow name="Skin" value={color("Skin")} onChange={(v) => update({ colors: { ...cust.colors, Skin: v } })} swatches={["#f1d0b5", "#d9a77f", "#b98262", "#8d5a3b", "#5c3a26"]} />
                  <Slider label="Skin finish" min={0.2} max={1} step={0.05} value={cust.finish?.Skin ?? model.materials.get("Skin")!.roughness} format={(v) => (v < 0.45 ? "Glossy" : v < 0.75 ? "Natural" : "Matte")} onChange={(v) => update({ finish: { ...cust.finish, Skin: v } })} />
                </div>
              )}
              {accs.filter((a) => !FACE_ACCESSORIES.includes(a)).length > 0 && (
                <div className="pt-3">
                  {accs.filter((a) => !FACE_ACCESSORIES.includes(a)).map((a) => (
                    <Toggle key={a} label={ACCESSORY_LABEL[a] ?? a} checked={acc(a)} onChange={(v) => update({ accessories: { ...cust.accessories, [a]: v } })} />
                  ))}
                </div>
              )}
            </div>
          )}

          {model && tab === "clothing" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {OUTFITS.map((o) => (
                  <button
                    key={o.id}
                    aria-pressed={cust.outfit === o.id}
                    onClick={() =>
                      update({
                        outfit: o.id,
                        colors: { ...cust.colors, ...Object.fromEntries(Object.entries(o.colors).filter(([k]) => mats.includes(k))) },
                        accessories: { ...cust.accessories, ...Object.fromEntries(Object.entries(o.accessories).filter(([k]) => accs.includes(k))) },
                      })
                    }
                    className={`rounded-2xl bg-void/50 p-2 text-left ${cust.outfit === o.id ? "ring-2 ring-violet" : "hover:bg-graphite"}`}
                  >
                    <span className="mb-1.5 flex gap-0.5">
                      {Object.values(o.colors).slice(0, 3).map((col, i) => (
                        <span key={i} className="h-5 flex-1 rounded" style={{ background: col }} />
                      ))}
                    </span>
                    <span className="text-[13px]">{o.name}</span>
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] text-mist">Outfits recolour the existing clothing and toggle matching accessories. Changing the garment shape itself needs a new generation.</p>
              <div>
                {mats.filter((m) => !FACE_MATERIALS.includes(m) && m !== "Skin").map((m) => (
                  <ColorRow key={m} name={m} value={color(m)} onChange={(v) => update({ colors: { ...cust.colors, [m]: v } })} />
                ))}
              </div>
            </div>
          )}

          {model && (
            <p className="border-t border-line/60 pt-3 text-[12.5px] text-mist">
              Not editable on this model: {unsupported.join(", ")}. These change the mesh itself, so they need a new generation.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function CustomisePage() {
  return <Studio title="Character Customisation" path="/studio/customise">{(d) => <Customiser data={d} />}</Studio>;
}
