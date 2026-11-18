"use client";

import { Camera, ImagePlus, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { ANGLES, type Angle } from "@/lib/types";
import { GRADE_LABEL } from "@/lib/imageQuality";
import { ANGLE_INFO, AngleGuide } from "./AngleGuide";
import { ACCEPT, usePhotoUpload } from "./usePhotoUpload";
import { useWizard } from "./wizardStore";

function gradeTone(g?: string) {
  return g === "excellent" || g === "good" ? "text-ok" : g === "fair" ? "text-warn" : "text-bad";
}

function PhotoCard({ angle, maxMb, onFocus }: { angle: Angle; maxMb: number; onFocus: (a: Angle | null) => void }) {
  const slot = useWizard((s) => s.photos[angle]);
  const consent = useWizard((s) => s.ownershipConfirmed);
  const { add, remove } = usePhotoUpload(maxMb);
  const camRef = useRef<HTMLInputElement>(null);
  const info = ANGLE_INFO[angle];
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    noClick: !!slot?.preview,
    disabled: !consent,
    onDropAccepted: (f) => add(angle, f[0]),
    onDropRejected: (r) => r[0] && add(angle, r[0].file),
  });
  const grade = slot?.report?.grade ?? slot?.savedQuality?.split(":")[0];
  const score = slot?.report?.score ?? slot?.savedQuality?.split(":")[1];
  const busy = slot?.status === "analysing" || slot?.status === "uploading";

  return (
    <div className="panel flex flex-col overflow-hidden" onMouseEnter={() => onFocus(angle)} onMouseLeave={() => onFocus(null)} onFocus={() => onFocus(angle)}>
      <div
        {...getRootProps({
          className: `relative grid aspect-[3/4] place-items-center overflow-hidden outline-none transition-colors ${isDragActive ? "bg-violet/15" : "bg-void/50"} ${consent && !slot?.preview ? "cursor-pointer hover:bg-graphite" : ""}`,
          "aria-label": `Upload ${info.title} photo`,
        })}
      >
        <input {...getInputProps()} />
        {slot?.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.preview} alt={`${info.title} photo`} className="size-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-[13px] text-mist">
            <ImagePlus className="size-6" />
            {consent ? (isDragActive ? "Drop to upload" : "Drop a photo or click") : "Confirm photo permission above to upload"}
          </div>
        )}
        {busy && (
          <div className="absolute inset-x-0 bottom-0 bg-void/80 p-2.5 text-xs">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> {slot?.status === "analysing" ? "Checking quality" : `Uploading ${Math.round((slot?.progress ?? 0) * 100)}%`}
            </div>
            <div className="h-1 rounded-full bg-line">
              <div className="h-1 rounded-full bg-volt transition-[width]" style={{ width: `${(slot?.status === "uploading" ? slot.progress : 0.15) * 100}%` }} />
            </div>
          </div>
        )}
        {slot?.status === "uploaded" && grade && (
          <span className={`absolute left-2 top-2 rounded-full bg-void/80 px-2 py-0.5 text-[11px] font-medium ${gradeTone(grade)}`}>
            {score}% {GRADE_LABEL[grade as keyof typeof GRADE_LABEL]}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {info.title}
            {info.required && <span className="ml-1.5 text-[11px] font-normal text-violet">Recommended</span>}
          </h3>
          {slot?.preview && !busy && (
            <div className="flex gap-0.5">
              <button aria-label={`Replace ${info.title} photo`} title="Replace" onClick={open} className="rounded-lg p-1.5 text-mist hover:bg-graphite hover:text-paper">
                <RefreshCw className="size-3.5" />
              </button>
              <button aria-label={`Remove ${info.title} photo`} title="Remove" onClick={() => remove(angle)} className="rounded-lg p-1.5 text-mist hover:bg-graphite hover:text-bad">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <p className="text-[12.5px] leading-snug text-mist">{info.how}</p>
        {slot?.status === "error" && (
          <p role="alert" className="mt-1 flex gap-1.5 text-[12.5px] text-bad">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {slot.error}
          </p>
        )}
        {!slot?.preview && consent && (
          <>
            <button onClick={() => camRef.current?.click()} className="mt-auto flex h-8 items-center justify-center gap-1.5 rounded-full bg-graphite text-[12.5px] hover:bg-line sm:hidden">
              <Camera className="size-3.5" /> Take photo
            </button>
            <input ref={camRef} type="file" accept="image/*" capture={angle === "front" ? "user" : "environment"} className="hidden" onChange={(e) => e.target.files?.[0] && add(angle, e.target.files[0])} />
          </>
        )}
      </div>
    </div>
  );
}

export function UploadStep({ maxMb }: { maxMb: number }) {
  const { photos, ownershipConfirmed, set } = useWizard();
  const [focus, setFocus] = useState<Angle | null>(null);
  const { add } = usePhotoUpload(maxMb);
  const uploaded = Object.fromEntries(ANGLES.map((a) => [a, photos[a]?.status === "uploaded"])) as Record<Angle, boolean>;
  const count = Object.values(uploaded).filter(Boolean).length;

  // Bulk drop: fill empty angles in recommended order.
  const bulk = useDropzone({
    accept: ACCEPT,
    multiple: true,
    noClick: true,
    disabled: !ownershipConfirmed,
    onDrop: (files) => {
      const empty = ANGLES.filter((a) => !useWizard.getState().photos[a]);
      files.slice(0, empty.length).forEach((f, i) => add(empty[i], f));
    },
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="order-2 space-y-5 lg:order-1">
        <div className="panel flex flex-col items-center gap-3 p-5">
          <AngleGuide active={focus} uploaded={uploaded} onPick={setFocus} />
          <p className="min-h-[3.5em] text-center text-[13px] text-mist">{focus ? ANGLE_INFO[focus].how : "The person stays still in the centre; the camera moves around them. Hover or tap an angle to see how to shoot it."}</p>
        </div>
        <div className="panel space-y-2 p-5 text-[13px] text-mist">
          <p className="text-sm text-paper">Tips for the best result</p>
          <p>Same person, same outfit and same lighting in every photo.</p>
          <p>Soft, even light. Plain background. Whole head visible, nothing covering the face.</p>
          <p>{count < 3 ? `You have ${count} of 6 angles. You can continue with fewer, but more angles give a more consistent character.` : `${count} of 6 angles uploaded.`}</p>
        </div>
      </aside>
      <div className="order-1 space-y-4 lg:order-2">
        <label className="panel flex cursor-pointer items-start gap-3 p-4">
          <input type="checkbox" className="mt-1 size-4 accent-[#8b6cff]" checked={ownershipConfirmed} onChange={(e) => set({ ownershipConfirmed: e.target.checked })} />
          <span className="text-sm">
            These are photos of me, or I have the person&apos;s permission to use them. All photos show the same person.
            <span className="block text-[13px] text-mist">Photos are stored privately and only used to build this character. They are never used to train models.</span>
          </span>
        </label>
        <div {...bulk.getRootProps({ className: `rounded-[24px] p-1 transition-colors ${bulk.isDragActive ? "bg-violet/10 ring-2 ring-violet" : ""}` })}>
          <input {...bulk.getInputProps()} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ANGLES.map((a) => (
              <PhotoCard key={a} angle={a} maxMb={maxMb} onFocus={setFocus} />
            ))}
          </div>
          <p className="mt-3 text-center text-[13px] text-mist">JPG, PNG or WEBP up to {maxMb} MB each. Drop several photos here at once to fill the empty angles.</p>
        </div>
      </div>
    </div>
  );
}
