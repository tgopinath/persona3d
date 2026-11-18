"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { consistency, GRADE_LABEL, type QualityReport } from "@/lib/imageQuality";
import { ANGLES, type Angle } from "@/lib/types";
import { ANGLE_INFO } from "./AngleGuide";
import { useWizard } from "./wizardStore";

const tone = (s: number) => (s >= 85 ? "bg-ok" : s >= 70 ? "bg-volt" : s >= 50 ? "bg-warn" : "bg-bad");

export function QualityStep({ characterType }: { characterType: string }) {
  const photos = useWizard((s) => s.photos);
  const withReports = ANGLES.filter((a) => photos[a]?.status === "uploaded").map((a) => ({ angle: a, slot: photos[a]! }));
  const reports = withReports.filter((x) => x.slot.report).map((x) => ({ angle: x.angle, report: x.slot.report as QualityReport }));
  const cons = consistency(reports);
  const missing = ANGLES.filter((a) => !photos[a] || photos[a]?.status !== "uploaded");
  const notes: string[] = [];
  if (withReports.length === 1) notes.push("Only one photo uploaded. The provider will have to guess the sides and back, so expect less accurate geometry there.");
  if (missing.includes("front")) notes.push("No front photo. Most reconstruction services rely on a clear front view; add one if you can.");
  if (characterType === "full_body" && missing.includes("back")) notes.push("No back photo. For a full-body character the back will be inferred.");
  if (cons.outliers.length)
    notes.push(
      `The ${cons.outliers.map((a) => ANGLE_INFO[a].title.toLowerCase()).join(" and ")} photo${cons.outliers.length > 1 ? "s look" : " looks"} quite different in skin tone or lighting from the others. Make sure every photo shows the same person in similar light.`
    );

  return (
    <div className="space-y-5">
      <p className="max-w-prose text-mist">
        These scores estimate image quality — lighting, sharpness, resolution, face visibility and background. They aren&apos;t a guarantee of how closely the 3D character will resemble the person.
      </p>
      {notes.length > 0 && (
        <div className="space-y-2">
          {notes.map((n) => (
            <p key={n} className="flex gap-2 rounded-2xl bg-warn/10 px-4 py-3 text-sm text-warn">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {n}
            </p>
          ))}
        </div>
      )}
      {cons.score !== null && !cons.outliers.length && (
        <p className="flex gap-2 rounded-2xl bg-ok/10 px-4 py-3 text-sm text-ok">
          <CircleCheck className="mt-0.5 size-4 shrink-0" /> Skin tone and lighting look consistent across your photos ({cons.score}% similarity estimate).
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {withReports.map(({ angle, slot }) => {
          const r = slot.report;
          const [g, sc] = slot.savedQuality?.split(":") ?? [];
          return (
            <article key={angle} className="panel flex gap-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slot.preview} alt="" className="h-36 w-28 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold">{ANGLE_INFO[angle as Angle].title}</h3>
                  <span className="text-sm tabular-nums">
                    {r?.score ?? sc}% <span className="text-mist">{GRADE_LABEL[(r?.grade ?? g) as keyof typeof GRADE_LABEL]}</span>
                  </span>
                </div>
                {r ? (
                  <>
                    <dl className="mt-2 space-y-1.5">
                      {r.checks.map((c) => (
                        <div key={c.id} className="grid grid-cols-[96px_1fr_32px] items-center gap-2 text-[12.5px]">
                          <dt className="text-mist">{c.label}</dt>
                          <dd className="h-1.5 rounded-full bg-line">
                            <div className={`h-1.5 rounded-full ${tone(c.score)}`} style={{ width: `${c.score}%` }} />
                          </dd>
                          <dd className="text-right tabular-nums text-mist">{c.score}</dd>
                        </div>
                      ))}
                    </dl>
                    {r.recommendations.map((t) => (
                      <p key={t} className="mt-2 text-[13px] text-warn">
                        {t}
                      </p>
                    ))}
                    <p className="mt-2 text-[12px] text-mist">
                      {r.width}×{r.height}px
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-mist">Checked when it was uploaded. Replace the photo to see the full breakdown again.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
