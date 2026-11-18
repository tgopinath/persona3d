"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Studio, StudioHeader, type StudioData } from "@/components/StudioFrame";
import { CharacterStage } from "@/components/viewer/CharacterStage";
import { BACKGROUNDS, LIGHTING } from "@/components/viewer/ViewerControls";
import { useViewer, type Background, type View } from "@/components/viewer/viewerStore";
import { Button, Pill, Segmented } from "@/components/ui";
import { api } from "@/lib/client/api";
import { downloadBlob, exportGLTF, exportOBJ, exportTextures, pickVideoMime, recordVideo, renderPNG } from "@/lib/client/exporters";
import { useAsync } from "@/lib/client/hooks";
import type { LoadedModel } from "@/lib/client/modelRuntime";
import type { ExportRecord } from "@/lib/types";

type Kind = "model" | "textures" | "animation" | "turntable" | "render";
const KINDS: { id: Kind; label: string; body: string }[] = [
  { id: "model", label: "3D model", body: "GLB, GLTF or OBJ with your customisations." },
  { id: "textures", label: "Textures", body: "Image maps used by the model's materials." },
  { id: "animation", label: "Animation", body: "One animation as a GLB, or as a video." },
  { id: "turntable", label: "Turntable video", body: "A smooth 360° rotation rendered from the scene." },
  { id: "render", label: "Still render", body: "PNG, with or without a background." },
];
const RES: Record<string, [number, number]> = { "720p": [1280, 720], "1080p": [1920, 1080], square: [1080, 1080], portrait: [1080, 1350], "4k": [3840, 2160] };

function Exporter({ data }: { data: StudioData }) {
  const c = data.character;
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [kind, setKind] = useState<Kind>("model");
  const [format, setFormat] = useState<"glb" | "gltf" | "obj" | "fbx">("glb");
  const [anims, setAnims] = useState<"all" | "none">("all");
  const [chosenClip, setClipId] = useState("waving");
  const [animOut, setAnimOut] = useState<"glb" | "video">("glb");
  const [seconds, setSeconds] = useState(5);
  const [res, setRes] = useState("1080p");
  const [bg, setBg] = useState<Background>("gradient");
  const [video, setVideo] = useState<"mp4" | "webm">("mp4");
  const [angle, setAngle] = useState<View>("full");
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const history = useAsync(() => api<{ exports: (ExportRecord & { signed_url: string })[] }>(`/api/characters/${c.id}/exports`).then((r) => r.exports), `exports:${c.id}`);
  const viewer = useViewer();
  const stageRef = useRef<HTMLDivElement>(null);
  const safe = c.name.replace(/[^\w-]+/g, "_").slice(0, 40) || "character";

  useEffect(() => useViewer.getState().set({ clip: "idle", loop: true, sequence: null, autoRotate: false }), []);
  // Fall back to the first available clip when the preferred one isn't on this rig.
  const clipId = !model || model.clips.has(chosenClip) ? chosenClip : ([...model.clips.keys()][0] ?? "");

  const save = async (blob: Blob, ext: string, label: string, filename: string) => {
    downloadBlob(blob, filename);
    setStatus("Downloaded. Saving a copy to your export history…");
    const form = new FormData();
    form.set("file", blob, filename);
    form.set("format", ext);
    form.set("label", label);
    try {
      await api(`/api/characters/${c.id}/exports`, { method: "POST", body: form });
      setStatus(`Exported ${filename}`);
      history.reload();
    } catch (e) {
      setStatus(`Downloaded ${filename}, but saving to history failed: ${(e as Error).message}`);
    }
  };

  const run = async () => {
    setError(null);
    setStatus(null);
    setProgress(0);
    const [w, h] = RES[res];
    try {
      if (kind === "model") {
        if (format === "fbx") throw new Error("FBX needs the Blender conversion worker, which isn't configured on this server.");
        const ids = anims === "all" ? "all" : [];
        const blob = format === "obj" ? await exportOBJ() : await exportGLTF({ binary: format === "glb", clipIds: ids });
        await save(blob, format, anims === "all" && format !== "obj" ? "animated" : "static", `${safe}.${format}`);
      } else if (kind === "textures") {
        const tex = await exportTextures();
        if (!tex.length) throw new Error("This model uses solid colour materials and has no texture images to export.");
        for (const t of tex) downloadBlob(t.blob, `${safe}_${t.name}`);
        setStatus(`Downloaded ${tex.length} texture${tex.length > 1 ? "s" : ""}`);
      } else if (kind === "animation") {
        if (!model?.clips.has(clipId)) throw new Error("Pick an animation first.");
        if (animOut === "glb") {
          const blob = await exportGLTF({ binary: true, clipIds: [clipId] });
          await save(blob, "glb", clipId, `${safe}_${clipId}.glb`);
        } else {
          viewer.set({ clip: clipId, loop: true, sequence: null, playing: true });
          setStatus("Recording…");
          const { blob, mime } = await recordVideo({ width: w, height: h, background: bg, seconds, prefer: video, onProgress: setProgress });
          const ext = mime.includes("mp4") ? "mp4" : "webm";
          await save(blob, ext, clipId, `${safe}_${clipId}.${ext}`);
        }
      } else if (kind === "turntable") {
        viewer.goTo(angle);
        await new Promise((r) => setTimeout(r, 900)); // let the camera settle
        setStatus("Recording turntable…");
        const { blob, mime } = await recordVideo({ width: w, height: h, background: bg, seconds, prefer: video, turntable: true, onProgress: setProgress });
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        await save(blob, ext, `turntable${seconds}s`, `${safe}_turntable_${seconds}s.${ext}`);
      } else {
        const blob = await renderPNG({ width: w, height: h, background: bg });
        await save(blob, "png", bg === "transparent" ? "transparent" : "render", `${safe}_${bg}.png`);
      }
    } catch (e) {
      setError((e as Error).message);
      setStatus(null);
    } finally {
      setProgress(null);
    }
  };

  const mime = typeof window !== "undefined" ? pickVideoMime(video) : null;
  const isVideo = kind === "turntable" || (kind === "animation" && animOut === "video");
  const clipList = model ? [...model.clips.values()] : [];

  return (
    <div className="space-y-5">
      <StudioHeader character={c} title="Export Studio" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div ref={stageRef} className="relative self-start">
          <CharacterStage url={c.model_signed_url} providerAnimations={data.providerAnimations} customisation={c.customisation} onLoaded={(m) => (setModel(m), data.onModelLoaded(m))} className="h-[62vh] min-h-[380px]" />
          {progress !== null && (
            <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-void/85 p-3 text-sm backdrop-blur" role="status">
              {status ?? "Working…"}
              <div className="mt-2 h-1 rounded-full bg-line">
                <div className="h-1 rounded-full bg-gradient-to-r from-violet to-volt" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <section className="panel space-y-4 p-5">
            <div role="radiogroup" aria-label="What to export" className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => (
                <button key={k.id} role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={`rounded-2xl p-3 text-left ${kind === k.id ? "bg-graphite ring-2 ring-violet" : "bg-void/50 hover:bg-graphite"} ${k.id === "render" ? "col-span-2" : ""}`}>
                  <span className="block text-sm font-medium">{k.label}</span>
                  <span className="block text-[12px] text-mist">{k.body}</span>
                </button>
              ))}
            </div>

            {kind === "model" && (
              <>
                <div>
                  <p className="mb-2 text-sm">Format</p>
                  <Segmented label="Format" value={format} onChange={setFormat} options={[{ value: "glb", label: "GLB" }, { value: "gltf", label: "GLTF" }, { value: "obj", label: "OBJ" }, { value: "fbx", label: "FBX" }]} />
                  {format === "fbx" && <p className="mt-2 text-[12.5px] text-warn">FBX conversion runs in the Blender worker, which isn&apos;t configured here. Use GLB and convert in Blender, or set up the worker (see docs).</p>}
                  {format === "obj" && <p className="mt-2 text-[12.5px] text-mist">OBJ keeps geometry in the rest pose only — no skeleton, animation or morph targets.</p>}
                </div>
                {format !== "obj" && format !== "fbx" && (
                  <div>
                    <p className="mb-2 text-sm">Animations</p>
                    <Segmented label="Animations" value={anims} onChange={setAnims} options={[{ value: "all", label: `Include all (${clipList.length})` }, { value: "none", label: "Rig only" }]} />
                  </div>
                )}
              </>
            )}

            {kind === "textures" && model && <p className="text-sm text-mist">{model.textures.length ? `${model.textures.length} texture map${model.textures.length > 1 ? "s" : ""} found.` : "This model uses solid colour materials, so there are no texture images to export."}</p>}

            {kind === "animation" && (
              <>
                <label className="block">
                  <span className="mb-2 block text-sm">Animation</span>
                  <select value={clipId} onChange={(e) => (setClipId(e.target.value), viewer.set({ clip: e.target.value, sequence: null }))} className="h-10 w-full rounded-full bg-void/60 px-3 text-sm ring-1 ring-line">
                    {clipList.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Segmented label="Output" value={animOut} onChange={setAnimOut} options={[{ value: "glb", label: "GLB file" }, { value: "video", label: "Video" }]} />
              </>
            )}

            {kind === "turntable" && (
              <div>
                <p className="mb-2 text-sm">Camera angle</p>
                <Segmented label="Camera angle" value={angle} onChange={setAngle} options={[{ value: "full", label: "Hero" }, { value: "front", label: "Eye level" }, { value: "face", label: "Close-up" }]} />
              </div>
            )}

            {(isVideo || kind === "render") && (
              <>
                {isVideo && (
                  <div>
                    <p className="mb-2 text-sm">Duration</p>
                    <Segmented label="Duration" value={String(seconds)} onChange={(v) => setSeconds(Number(v))} options={[{ value: "5", label: "5 s" }, { value: "10", label: "10 s" }, { value: "15", label: "15 s" }]} />
                  </div>
                )}
                <div>
                  <p className="mb-2 text-sm">Resolution</p>
                  <Segmented
                    label="Resolution"
                    value={res}
                    onChange={setRes}
                    options={[{ value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }, { value: "square", label: "Square" }, { value: "portrait", label: "Portrait" }, ...(kind === "render" ? [{ value: "4k", label: "4K" }] : [])]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm">Background</p>
                  <div className="flex flex-wrap gap-1.5">
                    {BACKGROUNDS.filter((b) => !(isVideo && b.v === "transparent")).map((b) => (
                      <button key={b.v} onClick={() => setBg(b.v)} aria-pressed={bg === b.v} title={b.label} className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12.5px] ${bg === b.v ? "bg-paper text-void" : "bg-graphite"}`}>
                        <span className="size-5 rounded-full" style={{ background: b.swatch }} />
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm">Lighting</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LIGHTING.map((l) => (
                      <button key={l.v} onClick={() => viewer.set({ lighting: l.v })} aria-pressed={viewer.lighting === l.v} className={`h-8 rounded-full px-3 text-[12.5px] ${viewer.lighting === l.v ? "bg-paper text-void" : "bg-graphite"}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
                {isVideo && (
                  <div>
                    <p className="mb-2 text-sm">Video format</p>
                    <Segmented label="Video format" value={video} onChange={setVideo} options={[{ value: "mp4", label: "MP4" }, { value: "webm", label: "WebM" }]} />
                    {mime && !mime.includes(video) && <p className="mt-2 text-[12.5px] text-warn">This browser can&apos;t encode {video.toUpperCase()}; it will record {mime.includes("mp4") ? "MP4" : "WebM"} instead.</p>}
                  </div>
                )}
              </>
            )}

            <Button variant="primary" size="lg" className="w-full" loading={progress !== null} disabled={!model || (kind === "model" && format === "fbx")} onClick={run}>
              <Download className="size-4" /> {isVideo ? "Render video" : kind === "render" ? "Render PNG" : "Download"}
            </Button>
            {status && progress === null && <p className="text-[13px] text-ok">{status}</p>}
            {error && (
              <p role="alert" className="text-[13px] text-bad">
                {error}
              </p>
            )}
            <p className="text-[12px] text-mist">Not every format keeps everything: OBJ drops the skeleton and animation, videos have no transparency, and other apps may ignore morph targets.</p>
          </section>

          <section className="panel p-5">
            <p className="mb-2 text-sm">Export history</p>
            {!history.data?.length ? (
              <p className="text-[13px] text-mist">Nothing exported yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.data.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="flex items-center gap-2">
                      <Pill>{e.export_format.split("-")[0].toUpperCase()}</Pill>
                      {e.export_format.split("-").slice(1).join(" ")}
                    </span>
                    <a href={e.signed_url} className="text-volt hover:underline">
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export default function ExportPage() {
  return <Studio title="Export Studio" path="/studio/export">{(d) => <Exporter data={d} />}</Studio>;
}
