"use client";

import { Expand, MousePointer2, RotateCcw, RotateCw } from "lucide-react";
import { useViewer, type Background, type Lighting, type View } from "./viewerStore";

const VIEWS: { v: View; label: string }[] = [
  { v: "full", label: "Full body" },
  { v: "front", label: "Front" },
  { v: "three_quarter", label: "¾" },
  { v: "side", label: "Side" },
  { v: "rear", label: "Rear" },
  { v: "face", label: "Face" },
];
export const LIGHTING: { v: Lighting; label: string }[] = [
  { v: "studio", label: "Studio" },
  { v: "daylight", label: "Daylight" },
  { v: "cinematic", label: "Cinematic" },
  { v: "portrait", label: "Soft portrait" },
  { v: "dark", label: "Dark studio" },
];
export const BACKGROUNDS: { v: Background; label: string; swatch: string }[] = [
  { v: "gradient", label: "Gradient", swatch: "linear-gradient(135deg,#8b6cff,#3fa9ff)" },
  { v: "grey", label: "Neutral grey", swatch: "#4a4d58" },
  { v: "white", label: "White studio", swatch: "#f3f4f7" },
  { v: "dark", label: "Dark studio", swatch: "#111217" },
  { v: "transparent", label: "Transparent", swatch: "repeating-conic-gradient(#2a2c35 0 25%,#1a1b22 0 50%) 0/10px 10px" },
];

const chip = (on: boolean) => `h-8 shrink-0 rounded-full px-3 text-[13px] transition-colors ${on ? "bg-paper text-void" : "bg-void/55 text-paper hover:bg-void/80 backdrop-blur"}`;

/** Overlay toolbar for the stage: camera views (top) and look controls (bottom). */
export function ViewerControls({ fullscreenTarget }: { fullscreenTarget?: React.RefObject<HTMLElement | null> }) {
  const { goTo, view, lookAtCursor, autoRotate, set } = useViewer();
  return (
    <>
      <div className="absolute inset-x-3 top-3 flex gap-1.5 overflow-x-auto" role="toolbar" aria-label="Camera views">
        {VIEWS.map((x) => (
          <button key={x.v} className={chip(view.name === x.v)} onClick={() => goTo(x.v)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex gap-1.5">
        <button className={chip(lookAtCursor)} aria-pressed={lookAtCursor} title="Head follows your cursor" onClick={() => set({ lookAtCursor: !lookAtCursor })}>
          <MousePointer2 className="inline size-3.5" /> <span className="sr-only sm:not-sr-only">Look at me</span>
        </button>
        <button className={chip(autoRotate)} aria-pressed={autoRotate} title="Auto-rotate" onClick={() => set({ autoRotate: !autoRotate })}>
          <RotateCw className="inline size-3.5" /> <span className="sr-only sm:not-sr-only">Spin</span>
        </button>
        <button className={chip(false)} title="Reset camera" aria-label="Reset camera" onClick={() => goTo("reset")}>
          <RotateCcw className="inline size-3.5" />
        </button>
        {fullscreenTarget && (
          <button
            className={chip(false)}
            title="Full screen"
            aria-label="Full screen"
            onClick={() => (document.fullscreenElement ? document.exitFullscreen() : fullscreenTarget.current?.requestFullscreen())}
          >
            <Expand className="inline size-3.5" />
          </button>
        )}
      </div>
    </>
  );
}

export function LookPanel() {
  const { lighting, background, set } = useViewer();
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm text-mist">Lighting</p>
        <div className="flex flex-wrap gap-1.5">
          {LIGHTING.map((l) => (
            <button key={l.v} onClick={() => set({ lighting: l.v })} aria-pressed={lighting === l.v} className={`h-8 rounded-full px-3 text-[13px] ${lighting === l.v ? "bg-paper text-void" : "bg-graphite text-paper hover:bg-[#232636]"}`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-mist">Background</p>
        <div className="flex flex-wrap gap-2">
          {BACKGROUNDS.map((b) => (
            <button key={b.v} onClick={() => set({ background: b.v })} aria-pressed={background === b.v} title={b.label} className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] ${background === b.v ? "bg-paper text-void" : "bg-graphite"}`}>
              <span className="size-6 rounded-full ring-1 ring-white/10" style={{ background: b.swatch }} />
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
