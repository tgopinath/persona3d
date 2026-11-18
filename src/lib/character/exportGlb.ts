// GLB export that works in both the browser and Node (worker / API routes).

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

/** GLTFExporter reads Blobs through FileReader, which Node lacks. */
function ensureFileReader() {
  const g = globalThis as unknown as { FileReader?: unknown };
  if (typeof g.FileReader !== "undefined") return;
  class NodeFileReader {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((b) => {
        this.result = b;
        this.onload?.();
        this.onloadend?.();
      }, (e) => this.onerror?.(e));
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((b) => {
        this.result = `data:${blob.type || "application/octet-stream"};base64,${Buffer.from(b).toString("base64")}`;
        this.onload?.();
        this.onloadend?.();
      }, (e) => this.onerror?.(e));
    }
  }
  g.FileReader = NodeFileReader;
}

export async function exportGLB(
  object: THREE.Object3D,
  animations: THREE.AnimationClip[] = [],
  binary = true
): Promise<ArrayBuffer | object> {
  ensureFileReader();
  const exporter = new GLTFExporter();
  return exporter.parseAsync(object, { binary, animations, onlyVisible: false, trs: false });
}
