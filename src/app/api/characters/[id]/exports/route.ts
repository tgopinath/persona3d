import { handle, HttpError, rateLimit, requireUser } from "@/server/http";
import { CharacterExportService, VideoRenderingService } from "@/server/services/characters";

const TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "text/plain",
  png: "image/png",
  mp4: "video/mp4",
  webm: "video/webm",
};

export const GET = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  return Response.json({ exports: await CharacterExportService.list(user.id, (await params).id) });
});

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser(req);
  rateLimit(`export:${user.id}`, 30);
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("file");
  const ext = String(form.get("format") ?? "");
  const label = String(form.get("label") ?? "export").replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "export";
  if (!(file instanceof File)) throw new HttpError(400, "Missing file");
  if (!TYPES[ext]) throw new HttpError(400, `Unsupported export format "${ext}"`);
  if (file.size > 200 * 1024 * 1024) throw new HttpError(413, "Export exceeds 200 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const row =
    ext === "mp4" || ext === "webm"
      ? await VideoRenderingService.save(user.id, id, bytes, TYPES[ext], label)
      : await CharacterExportService.save(user.id, id, `${ext}-${label}`, bytes, TYPES[ext]);
  return Response.json({ export: row }, { status: 201 });
});
