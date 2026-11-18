"use client";

import { useEffect, useState } from "react";
import { buildDemoCharacter } from "../character/demoCharacter";
import { inspectRig, sampleAll } from "../animation/clips";
import { exportGLB } from "../character/exportGlb";

let cached: Promise<string> | null = null;

/**
 * Builds the sample character entirely in the browser using the same demo
 * generator as the server, exports it to a real GLB and returns a blob URL.
 */
export function useSampleCharacterUrl() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    cached ??= (async () => {
      const c = buildDemoCharacter({
        style: "stylised",
        characterType: "full_body",
        proportions: { height: 1, shoulders: 1.05, hips: 1, limbs: 1, head: 1 },
        appearance: { skin: "#b98262", hair: "#1d1410", top: "#6d5ae6", bottom: "#1f2433" },
        hairStyle: "short",
        accessories: { glasses: true },
      });
      const glb = (await exportGLB(c.root, sampleAll(inspectRig(c.root)))) as ArrayBuffer;
      return URL.createObjectURL(new Blob([glb], { type: "model/gltf-binary" }));
    })();
    cached.then(setUrl);
  }, []);
  return url;
}
