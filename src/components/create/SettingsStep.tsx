"use client";

import { STYLES } from "@/lib/styles";
import type { ProviderInfo, QualityPreset } from "@/lib/types";
import { Pill, Segmented, Toggle } from "../ui";
import { PRESETS, useWizard } from "./wizardStore";

const PRESET_COPY: Record<QualityPreset, { name: string; body: string }> = {
  fast: { name: "Fast", body: "Quick preview with lower processing requirements." },
  balanced: { name: "Balanced", body: "Good balance of quality and processing time." },
  high: { name: "High quality", body: "Higher-quality mesh and textures, subject to provider capabilities." },
};

export function SettingsStep({ providers }: { providers: ProviderInfo[] }) {
  const { settings, setSettings, processingConsent, set, photos } = useWizard();
  const provider = providers.find((p) => p.id === settings.provider);
  const photoCount = Object.values(photos).filter((p) => p?.status === "uploaded").length;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Quality preset" className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(PRESET_COPY) as QualityPreset[]).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={settings.preset === k}
              onClick={() => setSettings({ preset: k, ...PRESETS[k] })}
              className={`panel p-4 text-left ${settings.preset === k ? "ring-2 ring-violet" : "hover:ring-1 hover:ring-line"}`}
            >
              <span className="block font-semibold">{PRESET_COPY[k].name}</span>
              <span className="mt-1 block text-[13px] text-mist">{PRESET_COPY[k].body}</span>
            </button>
          ))}
        </div>
        <section className="panel grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm">Mesh quality</p>
            <Segmented label="Mesh quality" value={settings.meshQuality} onChange={(meshQuality) => setSettings({ meshQuality })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
          </div>
          <div>
            <p className="mb-2 text-sm">Texture resolution</p>
            <Segmented
              label="Texture resolution"
              value={String(settings.textureResolution) as "1024" | "2048" | "4096"}
              onChange={(v) => setSettings({ textureResolution: Number(v) as 1024 | 2048 | 4096 })}
              options={[{ value: "1024", label: "1K" }, { value: "2048", label: "2K" }, { value: "4096", label: "4K" }]}
            />
          </div>
          <div>
            <p className="mb-2 text-sm">Face detail</p>
            <Segmented label="Face detail" value={settings.faceDetail} onChange={(faceDetail) => setSettings({ faceDetail })} options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High" }]} />
          </div>
          <div>
            <p className="mb-2 text-sm">Body detail</p>
            <Segmented label="Body detail" value={settings.bodyDetail} onChange={(bodyDetail) => setSettings({ bodyDetail })} options={[{ value: "standard", label: "Standard" }, { value: "high", label: "High" }]} />
          </div>
          <div>
            <p className="mb-2 text-sm">Character style</p>
            <select value={settings.style} onChange={(e) => setSettings({ style: e.target.value as typeof settings.style })} className="h-10 w-full rounded-full bg-void/60 px-3 text-sm ring-1 ring-line">
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Toggle label="Remove background" hint="Isolate the person before reconstruction." checked={settings.removeBackground} onChange={(removeBackground) => setSettings({ removeBackground })} />
            <Toggle label="Preserve clothing" checked={settings.preserve.clothing} onChange={(clothing) => setSettings({ preserve: { ...settings.preserve, clothing } })} />
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <section className="panel p-5">
          <p className="mb-3 text-sm">Generation service</p>
          <div role="radiogroup" aria-label="Generation service" className="space-y-2">
            {providers.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={settings.provider === p.id}
                disabled={!p.configured}
                onClick={() => setSettings({ provider: p.id })}
                className={`w-full rounded-2xl p-3 text-left ${settings.provider === p.id ? "bg-graphite ring-2 ring-violet" : "bg-void/50"} disabled:opacity-45`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {p.name}
                  {p.demo ? <Pill tone="warn">Demo</Pill> : p.configured ? <Pill tone="volt">Connected</Pill> : <Pill>Needs API key</Pill>}
                </span>
                <span className="mt-1 block text-[12.5px] text-mist">{p.notes}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12.5px] text-mist">Generation time and cost depend on the service you choose. Paid services bill your own account with them.</p>
          {provider && photoCount > provider.maxImages && (
            <p className="mt-2 text-[12.5px] text-warn">
              {provider.name} accepts {provider.maxImages} views; the {provider.maxImages} most informative angles will be sent.
            </p>
          )}
        </section>
        <label className="panel flex cursor-pointer items-start gap-3 p-4">
          <input type="checkbox" className="mt-1 size-4 accent-[#8b6cff]" checked={processingConsent} onChange={(e) => set({ processingConsent: e.target.checked })} />
          <span className="text-sm">
            I agree to my photos being processed to generate this character{provider && !provider.demo ? ` by ${provider.name}` : ""}.
            <span className="block text-[13px] text-mist">Photos stay private and are never used for model training.</span>
          </span>
        </label>
      </aside>
    </div>
  );
}
