// Maps a free-text animation prompt to a sequence of supported preset clips.
// This is a keyword matcher, not AI motion generation — results are always
// labelled as presets in the UI.

import { CLIP_MAP } from "./animation/library";

const KEYWORDS: [RegExp, string][] = [
  [/moon ?walk/, "moonwalk"],
  [/robot/, "robot_dance"],
  [/funny walk|silly walk|goofy/, "funny_walk"],
  [/danc|groove|boogie/, "dancing"],
  [/wav(e|ing)|hello|hi\b|bye/, "waving"],
  [/run|sprint|jog/, "running"],
  [/walk|stroll|approach|towards the camera|forward/, "walking"],
  [/jump|hop|leap/, "jumping"],
  [/sit|seat/, "sitting"],
  [/clap|applau/, "clapping"],
  [/point/, "pointing"],
  [/talk|speak|chat|explain/, "talking"],
  [/laugh|giggle|haha/, "laughing"],
  [/think|ponder|wonder|hmm/, "thinking"],
  [/greet|bow|namaste|welcome/, "greeting"],
  [/bat(ting)?\b|cricket shot|drive the ball/, "cricket_batting"],
  [/bowl/, "cricket_bowling"],
  [/kick|football|soccer/, "football_kick"],
  [/basketball|shoot|dunk/, "basketball_shot"],
  [/tennis|forehand/, "tennis_swing"],
  [/pickleball|dink|paddle/, "pickleball_swing"],
  [/superhero|hero pose|power pose/, "superhero_pose"],
  [/celebrat|cheer|party|happy jump/, "celebration"],
  [/victory|win|champion|triumph/, "victory_pose"],
  [/idle|relax|breath/, "idle"],
  [/stand/, "standing"],
];

export interface MotionPlan {
  steps: { clip: string; name: string; matched: string }[];
  unmatched: boolean;
  note: string;
}

export function planMotion(prompt: string): MotionPlan {
  const p = prompt.toLowerCase();
  const hits: { clip: string; index: number; matched: string }[] = [];
  for (const [re, clip] of KEYWORDS) {
    const m = re.exec(p);
    if (m && !hits.some((h) => h.clip === clip)) hits.push({ clip, index: m.index, matched: m[0] });
  }
  // "moonwalk" also matches "walk"; drop walking when a more specific walk matched.
  const filtered = hits.filter((h) => !(h.clip === "walking" && hits.some((o) => ["moonwalk", "funny_walk"].includes(o.clip))));
  filtered.sort((a, b) => a.index - b.index);
  const steps = filtered.slice(0, 4).map((h) => ({ clip: h.clip, name: CLIP_MAP[h.clip].name, matched: h.matched }));
  if (!steps.length)
    return { steps: [{ clip: "idle", name: "Idle", matched: "" }], unmatched: true, note: "No matching preset found — showing Idle. Try words like dance, wave, walk, jump or celebrate." };
  return {
    steps,
    unmatched: false,
    note: `Text-to-motion generation is not configured. Using the closest preset${steps.length > 1 ? " sequence" : ""}: ${steps.map((s) => s.name).join(" → ")}.`,
  };
}
