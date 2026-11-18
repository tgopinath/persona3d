"use client";

// Exports rendered from the live three.js scene in the browser.

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { OBJExporter } from "three/examples/jsm/exporters/OBJExporter.js";
import { runtime, useViewer, type Background } from "@/components/viewer/viewerStore";
import { resetPose } from "./modelRuntime";

const BG: Record<Exclude<Background, "transparent">, [string, string]> = {
  gradient: ["#1b1530", "#07080d"],
  grey: ["#4a4d58", "#2a2c33"],
  white: ["#ffffff", "#d9dbe3"],
  dark: ["#1b1c24", "#07080b"],
};

function bgTexture(bg: Background) {
  if (bg === "transparent") return null;
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, BG[bg][0]);
  g.addColorStop(1, BG[bg][1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function need() {
  const { gl, scene, camera, model } = runtime;
  if (!gl || !scene || !camera || !model) throw new Error("The 3D viewer isn't ready yet — wait for the model to load.");
  return { gl, scene, camera, model };
}

/** Temporarily resize the renderer + set a background, run fn, then restore. */
async function withRender<T>(opts: { width: number; height: number; background: Background }, fn: (canvas: HTMLCanvasElement) => Promise<T>) {
  const { gl, scene, camera } = need();
  const prevSize = gl.getSize(new THREE.Vector2());
  const prevRatio = gl.getPixelRatio();
  const prevAspect = camera.aspect;
  const prevBg = scene.background;
  const tex = bgTexture(opts.background);
  try {
    gl.setPixelRatio(1);
    gl.setSize(opts.width, opts.height, false);
    camera.aspect = opts.width / opts.height;
    camera.updateProjectionMatrix();
    scene.background = tex;
    return await fn(gl.domElement);
  } finally {
    scene.background = prevBg;
    tex?.dispose();
    gl.setPixelRatio(prevRatio);
    gl.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
  }
}

export async function renderPNG(opts: { width: number; height: number; background: Background }): Promise<Blob> {
  return withRender(opts, async (canvas) => {
    runtime.renderNow?.();
    return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Render failed"))), "image/png"));
  });
}

/** Small square thumbnail of the current view. */
export function renderThumbnail() {
  return renderPNG({ width: 512, height: 512, background: "dark" });
}

export function pickVideoMime(prefer: "mp4" | "webm") {
  const mp4 = ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"];
  const webm = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  const order = prefer === "mp4" ? [...mp4, ...webm] : [...webm, ...mp4];
  return order.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? null;
}

/**
 * Records the live canvas with MediaRecorder. For turntables, the model yaw is
 * driven from elapsed time so the rotation is exactly 360° over the duration.
 */
export async function recordVideo(opts: {
  width: number;
  height: number;
  background: Background;
  seconds: number;
  prefer: "mp4" | "webm";
  turntable?: boolean;
  onProgress?: (p: number) => void;
}): Promise<{ blob: Blob; mime: string }> {
  const mime = pickVideoMime(opts.prefer);
  if (!mime) throw new Error("This browser can't record video from a canvas. Try a recent Chrome, Edge or Safari.");
  const bg = opts.background === "transparent" ? "dark" : opts.background; // video has no alpha
  return withRender({ ...opts, background: bg }, async (canvas) => {
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(16e6, opts.width * opts.height * 6) });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    const start = performance.now();
    const wasRotating = useViewer.getState().autoRotate;
    if (opts.turntable) useViewer.getState().set({ autoRotate: false });
    rec.start(250);
    await new Promise<void>((resolve) => {
      const step = () => {
        const t = (performance.now() - start) / 1000;
        if (opts.turntable) runtime.yaw = (Math.min(1, t / opts.seconds) * Math.PI * 2) % (Math.PI * 2);
        opts.onProgress?.(Math.min(1, t / opts.seconds));
        if (t >= opts.seconds) return resolve();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    runtime.yaw = null;
    if (runtime.model) runtime.model.wrapper.rotation.y = 0;
    if (opts.turntable) useViewer.getState().set({ autoRotate: wasRotating });
    return { blob: new Blob(chunks, { type: mime.split(";")[0] }), mime: mime.split(";")[0] };
  });
}

/** Run an export in the bind pose, then resume animation. */
async function inRestPose<T>(fn: () => Promise<T>) {
  const { model } = need();
  const s = useViewer.getState();
  const clip = s.clip;
  resetPose(model);
  model.wrapper.rotation.y = 0;
  model.root.updateMatrixWorld(true);
  try {
    return await fn();
  } finally {
    s.set({ clip: null });
    requestAnimationFrame(() => useViewer.getState().set({ clip }));
  }
}

/** Export the customised character. clipIds: which animations to include ("all" or a list). */
export async function exportGLTF(opts: { binary: boolean; clipIds: "all" | string[] }): Promise<Blob> {
  const { model } = need();
  const clips = [...model.clips.values()].filter((c) => opts.clipIds === "all" || opts.clipIds.includes(c.id)).map((c) => c.clip);
  return inRestPose(async () => {
    const out = await new GLTFExporter().parseAsync(model.root, { binary: opts.binary, animations: clips, onlyVisible: true });
    return opts.binary ? new Blob([out as ArrayBuffer], { type: "model/gltf-binary" }) : new Blob([JSON.stringify(out)], { type: "model/gltf+json" });
  });
}

export async function exportOBJ(): Promise<Blob> {
  const { model } = need();
  return inRestPose(async () => new Blob([new OBJExporter().parse(model.root)], { type: "text/plain" }));
}

export async function exportTextures(): Promise<{ name: string; blob: Blob }[]> {
  const { model } = need();
  const out: { name: string; blob: Blob }[] = [];
  for (const { name, texture } of model.textures) {
    const img = texture.image as CanvasImageSource & { width: number; height: number };
    if (!img?.width) continue;
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (blob) out.push({ name: `${name}.png`, blob });
  }
  return out;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
