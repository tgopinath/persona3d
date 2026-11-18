import { connection } from "next/server";
import { config, isSharedPublicLocal, isSupabaseConfigured } from "@/server/config";
import { defaultProviderId, listProviders } from "@/server/providers/registry";

// Public, non-secret configuration only.
export async function GET() {
  await connection(); // provider keys are read at request time, never baked into the build
  return Response.json({
    mode: isSupabaseConfigured() ? "supabase" : "local",
    providers: listProviders(),
    defaultProvider: defaultProviderId(),
    maxUploadMb: config.maxUploadMb,
    demoStageDelayMs: config.demoStageDelayMs,
    retentionDays: config.retentionDays,
    /** True on a public host without accounts: photos are refused, only the in-browser sample works. */
    publicDemo: isSharedPublicLocal(),
  });
}
