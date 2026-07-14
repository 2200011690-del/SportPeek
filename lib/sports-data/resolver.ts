import type { SportsCapability, SportsProviderName } from "./models";

export type ProviderResolution = { state: "cache" | "provider" | "stale" | "unavailable"; provider: SportsProviderName | null; stale: boolean; reason: string };
export type ProviderConfiguration = { primary: SportsProviderName; fallbacks: SportsProviderName[]; capability: SportsCapability };

export function resolveProvider(config: ProviderConfiguration | null, context: { cacheUpdatedAt?: string | null; cacheTtlSeconds?: number; enabledProviders: SportsProviderName[]; failedProviders?: SportsProviderName[]; now?: number }): ProviderResolution {
  const now = context.now ?? Date.now();
  const cacheAge = context.cacheUpdatedAt ? now - Date.parse(context.cacheUpdatedAt) : Number.POSITIVE_INFINITY;
  const fresh = Number.isFinite(cacheAge) && cacheAge <= (context.cacheTtlSeconds ?? 300) * 1000;
  if (fresh) return { state: "cache", provider: config?.primary ?? null, stale: false, reason: "fresh_cache" };
  if (config) {
    const failed = new Set(context.failedProviders ?? []);
    for (const provider of [config.primary, ...config.fallbacks]) {
      if (context.enabledProviders.includes(provider) && !failed.has(provider)) return { state: "provider", provider, stale: false, reason: provider === config.primary ? "primary" : "fallback" };
    }
  }
  if (context.cacheUpdatedAt) return { state: "stale", provider: config?.primary ?? null, stale: true, reason: "stale_cache" };
  return { state: "unavailable", provider: null, stale: false, reason: "no_provider_or_cache" };
}
