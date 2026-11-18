import crypto from "node:crypto";
import { isSupabaseConfigured } from "@/server/config";
import { LocalStorage, signLocal, storage } from "@/server/storage";

// Serves private local-storage files only with a valid, unexpired HMAC signature.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (isSupabaseConfigured()) return new Response("Not found", { status: 404 });
  const key = (await params).path.map(decodeURIComponent).join("/");
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  const expected = signLocal(key, exp);
  if (!exp || exp < Date.now() / 1000 || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return new Response("Link expired or invalid", { status: 403 });
  const s = storage() as LocalStorage;
  try {
    const data = await s.get(key);
    const download = url.searchParams.get("download");
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": s.contentType(key),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        ...(download ? { "Content-Disposition": `attachment; filename="${download.replace(/[^\w.-]/g, "_")}"` } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
