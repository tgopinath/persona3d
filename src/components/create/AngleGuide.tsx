"use client";

import type { Angle } from "@/lib/types";

export const ANGLE_INFO: Record<Angle, { title: string; how: string; deg: number; required?: boolean }> = {
  front: { title: "Front", how: "Face the camera with a neutral expression, arms relaxed.", deg: 0, required: true },
  three_quarter_left: { title: "Three-quarter left", how: "Turn about 45° to your left, keep eyes level.", deg: -45 },
  left: { title: "Left profile", how: "Turn 90° to your left so the camera sees your left side.", deg: -90 },
  three_quarter_right: { title: "Three-quarter right", how: "Turn about 45° to your right, keep eyes level.", deg: 45 },
  right: { title: "Right profile", how: "Turn 90° to your right so the camera sees your right side.", deg: 90 },
  back: { title: "Back", how: "Turn fully away. Needed for full-body characters.", deg: 180 },
};

/**
 * Top-down diagram: the person stays in the centre, the camera moves around.
 * Highlighted angle = the one being hovered or focused; filled dots = uploaded.
 */
export function AngleGuide({ active, uploaded, onPick }: { active: Angle | null; uploaded: Partial<Record<Angle, boolean>>; onPick: (a: Angle) => void }) {
  const R = 96;
  const activeDeg = active ? ANGLE_INFO[active].deg : 0;
  return (
    <svg viewBox="-140 -140 280 280" className="w-full max-w-[300px]" role="group" aria-label="Camera angle guide">
      <defs>
        <radialGradient id="ag-floor">
          <stop offset="0" stopColor="#8b6cff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8b6cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle r={R} fill="none" stroke="#262938" strokeDasharray="3 5" />
      <circle r="58" fill="url(#ag-floor)" />
      {/* person seen from above, rotated so they face the active camera */}
      <g style={{ transition: "transform .4s ease" }} transform={`rotate(${-activeDeg})`}>
        <ellipse rx="30" ry="15" fill="#2a2d40" />
        <circle r="13" fill="#3b3f57" />
        <path d="M-5 11 L0 21 L5 11 Z" fill="#9da2b8" />
      </g>
      {(Object.keys(ANGLE_INFO) as Angle[]).map((a) => {
        const deg = ANGLE_INFO[a].deg;
        // Camera positions: front camera at the bottom (person faces viewer of diagram).
        const rad = ((deg + 90) * Math.PI) / 180;
        const x = Math.cos(rad) * R;
        const y = Math.sin(rad) * R;
        const on = active === a;
        return (
          <g key={a} transform={`translate(${x} ${y})`} className="cursor-pointer" onClick={() => onPick(a)} role="button" aria-label={ANGLE_INFO[a].title} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onPick(a)}>
            {on && <line x1="0" y1="0" x2={-x * 0.55} y2={-y * 0.55} stroke="#3fa9ff" strokeWidth="1.5" strokeDasharray="2 3" />}
            <circle r={on ? 15 : 12} fill={uploaded[a] ? "#8b6cff" : on ? "#3fa9ff" : "#1a1c27"} stroke={on ? "#3fa9ff" : "#262938"} strokeWidth="2" />
            <rect x="-6" y="-4" width="12" height="8" rx="2" fill={uploaded[a] || on ? "#05060a" : "#9da2b8"} />
            <circle r="2.2" fill={uploaded[a] || on ? "#ecebf4" : "#05060a"} />
          </g>
        );
      })}
    </svg>
  );
}
