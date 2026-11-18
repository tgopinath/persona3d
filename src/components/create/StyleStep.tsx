"use client";

import { STYLES } from "@/lib/styles";
import type { Realism, StyleId } from "@/lib/types";
import { Segmented } from "../ui";
import { useWizard } from "./wizardStore";

const SHAPE: Record<StyleId, { head: number; body: number; facets?: boolean; cape?: boolean; eyes: number }> = {
  realistic: { head: 1, body: 1, eyes: 0.8 },
  stylised: { head: 1.3, body: 0.92, eyes: 1.3 },
  cartoon: { head: 1.45, body: 0.85, eyes: 1.6 },
  anime: { head: 1.2, body: 1.05, eyes: 1.9 },
  low_poly: { head: 1.1, body: 1, facets: true, eyes: 1 },
  game_ready: { head: 1.05, body: 1, eyes: 0.9 },
  miniature: { head: 1.85, body: 0.68, eyes: 1.6 },
  fantasy: { head: 1.1, body: 1.02, cape: true, eyes: 1.1 },
};

/** Proportion sketch of each style — the same ratios the demo generator uses. */
function StyleFigure({ id, colors }: { id: StyleId; colors: [string, string] }) {
  const s = SHAPE[id];
  const hr = 13 * s.head;
  const bodyH = 58 * s.body;
  const top = 112 - bodyH - hr * 2;
  const cy = top + hr;
  return (
    <svg viewBox="0 0 100 120" className="h-full" aria-hidden>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors[0]} />
          <stop offset="1" stopColor={colors[1]} />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="114" rx="26" ry="4" fill="#000" opacity=".35" />
      {s.cape && <path d={`M34 ${cy + hr + 4} L28 112 L72 112 L66 ${cy + hr + 4}Z`} fill={colors[1]} opacity=".55" />}
      {s.facets ? (
        <>
          <polygon points={`38,${cy + hr + 4} 62,${cy + hr + 4} 66,${112 - bodyH * 0.45} 34,${112 - bodyH * 0.45}`} fill={`url(#g-${id})`} />
          <polygon points={`36,${112 - bodyH * 0.45} 48,${112 - bodyH * 0.45} 46,112 38,112`} fill="#262938" />
          <polygon points={`52,${112 - bodyH * 0.45} 64,${112 - bodyH * 0.45} 62,112 54,112`} fill="#262938" />
          <polygon points={`50,${cy - hr} ${50 + hr},${cy} 50,${cy + hr} ${50 - hr},${cy}`} fill="#d8a27c" />
        </>
      ) : (
        <>
          <rect x="36" y={cy + hr + 3} width="28" height={bodyH * 0.56} rx="12" fill={`url(#g-${id})`} />
          <rect x="38" y={112 - bodyH * 0.48} width="10" height={bodyH * 0.48} rx="5" fill="#262938" />
          <rect x="52" y={112 - bodyH * 0.48} width="10" height={bodyH * 0.48} rx="5" fill="#262938" />
          <circle cx="50" cy={cy} r={hr} fill="#d8a27c" />
          <path d={`M${50 - hr} ${cy - 1} a${hr} ${hr} 0 0 1 ${hr * 2} 0 q-${hr} -${hr * 0.45} -${hr * 2} 0z`} fill="#2b1d16" />
        </>
      )}
      {[-1, 1].map((k) => (
        <circle key={k} cx={50 + k * hr * 0.38} cy={cy + hr * 0.12} r={1.6 * s.eyes} fill="#1a1020" />
      ))}
      {id === "fantasy" && [-1, 1].map((k) => <path key={k} d={`M${50 + k * hr * 0.95} ${cy} l${k * 8} -9 l${-k * 3} 10z`} fill="#d8a27c" />)}
    </svg>
  );
}

export function StyleStep() {
  const { settings, setSettings } = useWizard();
  return (
    <div className="space-y-6">
      <div role="radiogroup" aria-label="Character style" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STYLES.map((s) => {
          const on = settings.style === s.id;
          return (
            <button
              key={s.id}
              role="radio"
              aria-checked={on}
              onClick={() => setSettings({ style: s.id })}
              className={`panel flex flex-col overflow-hidden text-left transition-shadow ${on ? "ring-2 ring-violet" : "hover:ring-1 hover:ring-line"}`}
            >
              <div className="grid h-36 place-items-center" style={{ background: `radial-gradient(60% 55% at 50% 90%, ${s.gradient[0]}44, transparent), #0b0c13` }}>
                <StyleFigure id={s.id} colors={s.gradient} />
              </div>
              <div className="p-3">
                <span className="block text-sm font-semibold">{s.name}</span>
                <span className="block text-[12.5px] text-mist">{s.tagline}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm">Level of realism</p>
          <p className="text-[13px] text-mist">How closely surfaces and proportions follow the photos.</p>
        </div>
        <Segmented<Realism>
          label="Level of realism"
          value={settings.realism}
          onChange={(realism) => setSettings({ realism })}
          options={[
            { value: "highly_realistic", label: "Highly realistic" },
            { value: "semi_realistic", label: "Semi-realistic" },
            { value: "stylised", label: "Stylised" },
            { value: "cartoon", label: "Cartoon" },
          ]}
        />
      </div>
      <p className="text-[13px] text-mist">Stylised looks are original designs inspired by feature animation; they don&apos;t copy any studio&apos;s characters.</p>
    </div>
  );
}
