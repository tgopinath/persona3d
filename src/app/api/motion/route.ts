import { handle, readJson, requireUser } from "@/server/http";
import { planMotion } from "@/lib/motionPrompt";

// No text-to-motion provider is configured, so prompts are mapped onto the
// closest presets and the response says so explicitly.
export const POST = handle(async (req) => {
  await requireUser(req);
  const { prompt } = await readJson<{ prompt?: string }>(req);
  return Response.json({ plan: planMotion(String(prompt ?? "").slice(0, 300)), generator: "preset-matcher" });
});
