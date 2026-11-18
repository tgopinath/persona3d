"use client";

/* eslint-disable react-hooks/immutability -- three.js objects (renderer, mixer, bones) are mutated imperatively inside effects and useFrame, which is the intended R3F pattern. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { applyCustomisation, clipHasTrack, loadModel, type LoadedModel } from "@/lib/client/modelRuntime";
import type { Customisation } from "@/lib/types";
import { runtime, useViewer, type Lighting } from "./viewerStore";
import { Loader2 } from "lucide-react";

export interface StageProps {
  url: string | null;
  providerAnimations?: { name: string; url: string }[];
  customisation?: Customisation | null;
  onLoaded?: (m: LoadedModel) => void;
  className?: string;
  /** Allow orbit/zoom/pan. */
  interactive?: boolean;
  /** Clip to play when nothing is selected. */
  defaultClip?: string;
}

const LIGHTS: Record<Lighting, { hemi: [string, string, number]; key: [string, number, [number, number, number]]; rim: [string, number]; fill: number; exposure: number }> = {
  studio: { hemi: ["#ffffff", "#2a2840", 0.7], key: ["#ffffff", 2.4, [2.5, 4, 3]], rim: ["#8b6cff", 2.2], fill: 0.6, exposure: 1 },
  daylight: { hemi: ["#dbeaff", "#5a5040", 1.2], key: ["#fff4e0", 3, [4, 6, 2]], rim: ["#bfe0ff", 0.8], fill: 0.4, exposure: 1.05 },
  cinematic: { hemi: ["#1c2340", "#05050a", 0.25], key: ["#ffd2a1", 3.2, [-3, 3, 2]], rim: ["#3fa9ff", 4], fill: 0.1, exposure: 1 },
  portrait: { hemi: ["#fff1e6", "#3a2e2a", 0.9], key: ["#fff0e0", 1.8, [1.5, 2.5, 3.5]], rim: ["#ffd9f0", 1.2], fill: 0.9, exposure: 1.05 },
  dark: { hemi: ["#30304a", "#000000", 0.2], key: ["#c9c4ff", 1.6, [1, 4, 2]], rim: ["#8b6cff", 3], fill: 0.05, exposure: 0.9 },
};

function Lights() {
  const preset = useViewer((s) => s.lighting);
  const L = LIGHTS[preset];
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = L.exposure;
  }, [gl, L.exposure]);
  return (
    <>
      <hemisphereLight args={[L.hemi[0], L.hemi[1], L.hemi[2]]} />
      <directionalLight color={L.key[0]} intensity={L.key[1]} position={L.key[2]} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight color={L.rim[0]} intensity={L.rim[1]} position={[-2.5, 2.5, -3]} />
      <directionalLight color="#ffffff" intensity={L.fill} position={[0, 1.2, 4]} />
    </>
  );
}

function CameraRig({ model, controls }: { model: LoadedModel | null; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const view = useViewer((s) => s.view);
  const camera = useThree((s) => s.camera);
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!model) return;
    const h = model.height * model.wrapper.scale.y;
    const mid = new THREE.Vector3(0, h * 0.52, 0);
    const d = h * 2.35;
    let pos: THREE.Vector3;
    let target = mid;
    switch (view.name) {
      case "front":
        pos = new THREE.Vector3(0, h * 0.6, d);
        break;
      case "side":
        pos = new THREE.Vector3(d, h * 0.6, 0);
        break;
      case "rear":
        pos = new THREE.Vector3(0, h * 0.6, -d);
        break;
      case "three_quarter":
        pos = new THREE.Vector3(d * 0.7, h * 0.62, d * 0.7);
        break;
      case "face": {
        const headPos = model.head ? model.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, h * 0.07, 0)) : new THREE.Vector3(0, h * 0.9, 0);
        target = headPos;
        pos = headPos.clone().add(new THREE.Vector3(0, 0.02, h * 0.75));
        break;
      }
      default:
        pos = new THREE.Vector3(h * 0.32, h * 0.6, d);
    }
    goal.current = { pos, target };
  }, [view, model]);

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = 1 - Math.exp(-dt * 6);
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 0.005 && c.target.distanceTo(g.target) < 0.005) goal.current = null;
  });

  // Hand control back to the user as soon as they drag.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => (goal.current = null);
    c.addEventListener("start", stop);
    return () => c.removeEventListener("start", stop);
  }, [controls, model]);
  return null;
}

function Animator({ model, defaultClip }: { model: LoadedModel; defaultClip?: string }) {
  const { clip, playing, speed, loop, sequence, sequenceIndex, lookAtCursor, autoRotate, set } = useViewer();
  const current = useRef<THREE.AnimationAction | null>(null);
  const blink = useRef({ next: 2, t: -1 });
  const pointer = useThree((s) => s.pointer);
  const look = useRef(new THREE.Quaternion());

  const active = clip ?? (defaultClip && model.clips.has(defaultClip) ? defaultClip : null);

  useEffect(() => {
    const entry = active ? model.clips.get(active) : null;
    if (!entry) {
      current.current?.fadeOut(0.25);
      current.current = null;
      return;
    }
    const action = model.mixer.clipAction(entry.clip);
    const inSequence = !!sequence;
    action.reset();
    action.setLoop(inSequence || !loop ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.enabled = true;
    const prev = current.current;
    if (prev && prev !== action) action.crossFadeFrom(prev, 0.3, false);
    action.play();
    current.current = action;
  }, [active, loop, sequence, sequenceIndex, model]);

  useEffect(() => {
    const onFinished = () => {
      const s = useViewer.getState();
      if (s.sequence) {
        const next = s.sequenceIndex + 1;
        if (next < s.sequence.length) set({ sequenceIndex: next, clip: s.sequence[next] });
        else if (s.loop) set({ sequenceIndex: 0, clip: s.sequence[0] });
        else set({ sequence: null, clip: model.clips.has("idle") ? "idle" : null });
      } else if (!s.loop) set({ clip: model.clips.has("idle") ? "idle" : null });
    };
    model.mixer.addEventListener("finished", onFinished);
    return () => model.mixer.removeEventListener("finished", onFinished);
  }, [model, set]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1);
    model.mixer.timeScale = playing ? speed : 0;
    model.mixer.update(d);
    const activeClip = current.current?.getClip();

    // Procedural blink when the active clip doesn't animate the eyelids.
    const lids = model.morphs.get("blink");
    if (lids && !clipHasTrack(activeClip, "[blink]")) {
      const b = blink.current;
      b.next -= d;
      if (b.next <= 0 && b.t < 0) b.t = 0;
      let w = 0;
      if (b.t >= 0) {
        b.t += d;
        w = Math.sin(Math.min(1, b.t / 0.16) * Math.PI);
        if (b.t > 0.16) {
          b.t = -1;
          b.next = 2 + Math.random() * 3;
        }
      }
      for (const m of lids) m.morphTargetInfluences![m.morphTargetDictionary!.blink] = w;
    }

    // Head follows the cursor.
    if (model.head) {
      const target = lookAtCursor ? new THREE.Quaternion().setFromEuler(new THREE.Euler(-pointer.y * 0.35, pointer.x * 0.6, 0)) : new THREE.Quaternion();
      look.current.slerp(target, 1 - Math.exp(-d * 8));
      if (!clipHasTrack(activeClip, `${model.head.name}.quaternion`)) model.head.quaternion.copy(model.rest.get(model.head)!.q);
      model.head.quaternion.multiply(look.current);
    }

    if (runtime.yaw !== null) model.wrapper.rotation.y = runtime.yaw;
    else if (autoRotate) model.wrapper.rotation.y += d * 0.5;
  });
  return null;
}

function Registrar() {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    runtime.gl = gl;
    runtime.scene = scene;
    runtime.camera = camera as THREE.PerspectiveCamera;
    runtime.renderNow = () => gl.render(scene, camera);
    return () => {
      runtime.gl = null;
      runtime.scene = null;
      runtime.camera = null;
      runtime.renderNow = null;
    };
  }, [gl, scene, camera, invalidate]);
  return null;
}

export function CharacterStage({ url, providerAnimations, customisation, onLoaded, className = "", interactive = true, defaultClip = "idle" }: StageProps) {
  // Results are tagged with the URL they belong to, so a new URL shows the loader without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ url: string; model: LoadedModel | null; error: string | null } | null>(null);
  const model = loaded?.url === url ? loaded.model : null;
  const error = loaded?.url === url ? loaded.error : null;
  const controls = useRef<OrbitControlsImpl | null>(null);
  const background = useViewer((s) => s.background);
  const goTo = useViewer((s) => s.goTo);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  });
  const animKey = JSON.stringify(providerAnimations ?? []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    loadModel(url, JSON.parse(animKey))
      .then((m) => {
        if (cancelled) return;
        runtime.model = m;
        setLoaded({ url, model: m, error: null });
        goTo("full");
        onLoadedRef.current?.(m);
      })
      .catch((e) => !cancelled && setLoaded({ url, model: null, error: (e as Error).message }));
    return () => {
      cancelled = true;
      runtime.model = null;
    };
  }, [url, animKey, goTo]);

  useEffect(() => {
    if (model) applyCustomisation(model, customisation ?? null);
  }, [model, customisation]);

  return (
    <div className={`stage ${className}`} data-bg={background}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 32, position: [0.6, 1.1, 3.4], near: 0.05, far: 100 }}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
        aria-label="Interactive 3D character viewer"
      >
        <Registrar />
        <Lights />
        {model && <primitive object={model.wrapper} />}
        {model && <Animator model={model} defaultClip={defaultClip} />}
        <ContactShadows position={[0, 0.001, 0]} opacity={0.55} scale={4} blur={2.4} far={2} />
        <OrbitControls ref={controls} makeDefault enabled={interactive} enablePan={interactive} minDistance={0.4} maxDistance={9} target={[0, 0.9, 0]} />
        <CameraRig model={model} controls={controls} />
      </Canvas>
      {!model && !error && url && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-mist">
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading 3D model
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center">
          <div className="max-w-sm">
            <p className="font-medium text-bad">Couldn&apos;t load this model</p>
            <p className="mt-1 text-sm text-mist">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
