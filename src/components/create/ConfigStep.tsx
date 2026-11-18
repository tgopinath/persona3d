"use client";

import type { BodyType, CharacterType } from "@/lib/types";
import { Field, Segmented, Slider, Toggle, inputCls } from "../ui";
import { useWizard } from "./wizardStore";

export function ConfigStep() {
  const { settings, setSettings, name, set } = useWizard();
  const p = settings.proportions;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel space-y-5 p-5">
        <Field label="Character name">
          <input value={name} maxLength={80} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Weekend Me" className={inputCls} />
        </Field>
        <div>
          <p className="mb-2 text-sm">Character type</p>
          <Segmented<CharacterType>
            label="Character type"
            value={settings.characterType}
            onChange={(characterType) => setSettings({ characterType })}
            options={[
              { value: "full_body", label: "Full body" },
              { value: "upper_body", label: "Upper body" },
              { value: "head", label: "Head and face" },
            ]}
          />
        </div>
        <div>
          <p className="mb-2 text-sm">Body proportions</p>
          <Segmented<BodyType>
            label="Body proportions"
            value={settings.bodyType}
            onChange={(bodyType) => setSettings({ bodyType })}
            options={[
              { value: "slim", label: "Slim" },
              { value: "average", label: "Average" },
              { value: "athletic", label: "Athletic" },
              { value: "custom", label: "Custom" },
            ]}
          />
          {settings.bodyType === "custom" && (
            <div className="mt-3 rounded-2xl bg-void/50 p-4">
              {(
                [
                  ["height", "Height"],
                  ["shoulders", "Shoulder width"],
                  ["hips", "Hip width"],
                  ["limbs", "Leg length"],
                  ["head", "Head size"],
                ] as const
              ).map(([k, label]) => (
                <Slider key={k} label={label} min={0.85} max={1.15} step={0.01} value={p[k]} format={pct} onChange={(v) => setSettings({ proportions: { ...p, [k]: v } })} />
              ))}
            </div>
          )}
        </div>
        <Field label="Describe additional details about your character" hint="Optional. Mention things the photos might miss, like glasses, a beard, long hair or a favourite outfit.">
          <textarea
            value={settings.description}
            maxLength={600}
            onChange={(e) => setSettings({ description: e.target.value })}
            rows={4}
            className={`${inputCls} h-auto py-3`}
            placeholder="Curly shoulder-length hair, round glasses, denim jacket"
          />
        </Field>
      </section>
      <section className="panel p-5">
        <p className="mb-1 text-sm">Keep from the photos</p>
        <p className="mb-2 text-[13px] text-mist">Reconstruction services try to keep these; results depend on the provider.</p>
        {(
          [
            ["hairstyle", "Original hairstyle"],
            ["facialHair", "Facial hair"],
            ["glasses", "Glasses"],
            ["accessories", "Visible accessories"],
            ["clothing", "Clothing where possible"],
          ] as const
        ).map(([k, label]) => (
          <Toggle key={k} label={label} checked={settings.preserve[k]} onChange={(v) => setSettings({ preserve: { ...settings.preserve, [k]: v } })} />
        ))}
      </section>
    </div>
  );
}
