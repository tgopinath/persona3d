"use client";

import { api, uploadWithProgress } from "@/lib/client/api";
import { analyseImage } from "@/lib/imageQuality";
import type { Angle, CharacterView } from "@/lib/types";
import { useWizard } from "./wizardStore";

export const ACCEPT = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] };
const OK_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function ensureCharacter() {
  const s = useWizard.getState();
  if (s.characterId) return s.characterId;
  const { character } = await api<{ character: CharacterView }>("/api/characters", { method: "POST", json: { name: s.name || "Untitled character" } });
  useWizard.getState().set({ characterId: character.id });
  const url = new URL(location.href);
  url.searchParams.set("c", character.id);
  history.replaceState(null, "", url);
  return character.id;
}

export function usePhotoUpload(maxMb: number) {
  const { setPhoto } = useWizard();

  async function add(angle: Angle, file: File) {
    const prev = useWizard.getState().photos[angle];
    if (prev?.preview?.startsWith("blob:")) URL.revokeObjectURL(prev.preview);
    if (!OK_TYPES.has(file.type)) {
      setPhoto(angle, { preview: "", status: "error", progress: 0, error: `${file.name} isn't supported. Use JPG, PNG or WEBP.`, fileName: file.name });
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setPhoto(angle, { preview: "", status: "error", progress: 0, error: `${file.name} is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${maxMb} MB.`, fileName: file.name });
      return;
    }
    const preview = URL.createObjectURL(file);
    setPhoto(angle, { preview, status: "analysing", progress: 0, error: undefined, report: undefined, savedQuality: undefined, fileName: file.name });
    let report;
    try {
      report = await analyseImage(file, angle);
    } catch {
      setPhoto(angle, { status: "error", error: "This image couldn't be decoded. Try exporting it again as JPG or PNG." });
      return;
    }
    setPhoto(angle, { report, status: "uploading" });
    try {
      const id = await ensureCharacter();
      const form = new FormData();
      form.set("file", file);
      form.set("angle", angle);
      form.set("quality", `${report.grade}:${report.score}`);
      form.set("ownership", "true");
      const res = await uploadWithProgress<{ photo: { id: string } }>(`/api/characters/${id}/photos`, form, (p) => setPhoto(angle, { progress: p }));
      setPhoto(angle, { status: "uploaded", progress: 1, photoId: res.photo.id });
    } catch (e) {
      setPhoto(angle, { status: "error", error: (e as Error).message });
    }
  }

  async function remove(angle: Angle) {
    const s = useWizard.getState();
    const slot = s.photos[angle];
    if (slot?.photoId && s.characterId) await api(`/api/characters/${s.characterId}/photos/${slot.photoId}`, { method: "DELETE" }).catch(() => undefined);
    if (slot?.preview?.startsWith("blob:")) URL.revokeObjectURL(slot.preview);
    setPhoto(angle, null);
  }

  return { add, remove };
}
