import { writeFileSync } from "node:fs";
import { buildDemoCharacter } from "../src/lib/character/demoCharacter";
import { inspectRig, sampleAll } from "../src/lib/animation/clips";
import { exportGLB } from "../src/lib/character/exportGlb";

const c = buildDemoCharacter({
  style: "stylised",
  characterType: "full_body",
  proportions: { height: 1, shoulders: 1, hips: 1, limbs: 1, head: 1 },
  appearance: { skin: "#c08a65", hair: "#20150f", top: "#3b82f6" },
  accessories: { glasses: true },
});
const rig = inspectRig(c.root);
console.log("compatible", rig.compatible, "missing", rig.missing, "morphs", rig.morphs, "hipScale", rig.hipScale.toFixed(2));
const clips = sampleAll(rig);
console.log("clips", clips.length, clips.map((x) => `${x.name}:${x.tracks.length}`).join(" "));
const t0 = Date.now();
const glb = (await exportGLB(c.root, clips)) as ArrayBuffer;
writeFileSync("/tmp/claude-502/demo.glb", Buffer.from(glb));
console.log("glb bytes", glb.byteLength, "ms", Date.now() - t0);
