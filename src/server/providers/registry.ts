import { config } from "../config";
import type { ProviderInfo } from "@/lib/types";
import { DemoProvider } from "./demo";
import { MeshyProvider } from "./meshy";
import { TripoProvider } from "./tripo";
import type { ProviderBundle } from "./types";

const demo = new DemoProvider();
const meshy = new MeshyProvider();
const tripo = new TripoProvider();

const BUNDLES: Record<string, ProviderBundle> = {
  demo: { reconstruction: demo },
  meshy: { reconstruction: meshy, rigging: meshy },
  tripo: { reconstruction: tripo, rigging: tripo },
};

export function listProviders(): ProviderInfo[] {
  return [demo.info(), meshy.info(), tripo.info()];
}

export function defaultProviderId() {
  if (config.defaultProvider && BUNDLES[config.defaultProvider]?.reconstruction.info().configured) return config.defaultProvider;
  if (meshy.info().configured) return "meshy";
  return "demo";
}

export function getProvider(id: string): ProviderBundle {
  const b = BUNDLES[id];
  if (!b) throw new Error(`Unknown provider "${id}"`);
  if (!b.reconstruction.info().configured) throw new Error(`Provider "${id}" is not configured on this server`);
  return b;
}
