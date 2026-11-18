// ImageUploadService + ImageValidationService + MultiViewAnalysisService

import { config } from "../config";
import { db, newId, now } from "../db";
import { storage } from "../storage";
import { HttpError } from "../http";
import { imageSize, MIME, sniffImage } from "@/lib/imageFile";
import { ANGLES, type Angle, type CharacterPhotoRecord, type GenerationSettings } from "@/lib/types";
import type { InputImage } from "../providers/types";
import { STYLES } from "@/lib/styles";

export const MIN_DIMENSION = 384;

/** ImageValidationService — server-side checks that never trust client metadata. */
export const ImageValidationService = {
  validate(bytes: Uint8Array, declaredName = "") {
    if (bytes.byteLength > config.maxUploadMb * 1024 * 1024) throw new HttpError(413, `File exceeds the ${config.maxUploadMb} MB limit`, "too_large");
    const kind = sniffImage(bytes);
    if (!kind) throw new HttpError(415, `Unsupported file${declaredName ? ` "${declaredName}"` : ""}. Use JPG, PNG or WEBP.`, "unsupported_type");
    const size = imageSize(bytes);
    if (!size) throw new HttpError(422, "Could not read image dimensions — the file may be corrupt", "corrupt");
    if (Math.min(size.width, size.height) < MIN_DIMENSION)
      throw new HttpError(422, `Image is ${size.width}×${size.height}. Use at least ${MIN_DIMENSION}px on the short side.`, "low_resolution");
    // Malware: we accept only raster formats verified by magic bytes and never execute or
    // serve them inline from our origin with a sniffable type. Hook an AV scanner here if required.
    return { kind, mime: MIME[kind], ...size };
  },
};

/** ImageUploadService — stores photos privately under the owner's prefix. */
export const ImageUploadService = {
  async upload(userId: string, characterId: string, angle: Angle, bytes: Uint8Array, quality: string, name?: string) {
    if (!ANGLES.includes(angle)) throw new HttpError(400, "Unknown camera angle");
    const v = ImageValidationService.validate(bytes, name);
    // Replace an existing photo for the same angle.
    const existing = await db().find("character_photos", { character_id: characterId, angle });
    for (const p of existing) {
      await storage().remove([p.image_url]);
      await db().remove("character_photos", p.id);
    }
    const key = `users/${userId}/characters/${characterId}/photos/${angle}-${Date.now()}.${v.kind === "jpeg" ? "jpg" : v.kind}`;
    await storage().put(key, bytes, v.mime);
    const row: CharacterPhotoRecord = { id: newId(), character_id: characterId, angle, image_url: key, quality_status: quality.slice(0, 64), created_at: now() };
    await db().insert("character_photos", row);
    return { row, width: v.width, height: v.height };
  },
  async remove(characterId: string, photoId: string) {
    const p = await db().get("character_photos", photoId);
    if (!p || p.character_id !== characterId) throw new HttpError(404, "Photo not found");
    await storage().remove([p.image_url]);
    await db().remove("character_photos", p.id);
  },
};

/** MultiViewAnalysisService — prepares multi-view inputs + texture guidance for providers. */
export const MultiViewAnalysisService = {
  async loadInputs(characterId: string): Promise<InputImage[]> {
    const photos = await db().find("character_photos", { character_id: characterId });
    const out: InputImage[] = [];
    for (const p of photos) {
      const data = await storage().get(p.image_url);
      const kind = sniffImage(data);
      if (!kind) continue;
      out.push({ angle: p.angle, mime: MIME[kind], data });
    }
    return out.sort((a, b) => ANGLES.indexOf(a.angle) - ANGLES.indexOf(b.angle));
  },
  texturePrompt(s: GenerationSettings) {
    const style = STYLES.find((x) => x.id === s.style);
    const keep = Object.entries(s.preserve)
      .filter(([, v]) => v)
      .map(([k]) => k.replace(/([A-Z])/g, " $1").toLowerCase());
    return [
      style ? `${style.name} character, ${style.promptHint}` : "",
      s.realism.replace("_", " "),
      keep.length ? `preserve ${keep.join(", ")}` : "",
      s.description,
    ]
      .filter(Boolean)
      .join(". ");
  },
};
