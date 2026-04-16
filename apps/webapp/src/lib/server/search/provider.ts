import { getScoutLimits, getSearchProviderName } from "@scout/config";
import type { ResolvedMarketIntent, ScoutAcquisitionResult } from "@scout/domain";

import { acquireCandidates } from "./acquisition.ts";
import { createDuckDuckGoHtmlProvider } from "./duckduckgo-provider.ts";
import type { SearchProviderAdapter } from "./provider-types.ts";
import { createSeededFallbackProvider } from "./seeded-provider.ts";

export interface SearchProvider {
  search: (intent: ResolvedMarketIntent) => Promise<ScoutAcquisitionResult>;
}

function resolveLiveProviders(configuredProvider: string): SearchProviderAdapter[] {
  if (configuredProvider === "seeded_stub") {
    return [];
  }

  return [createDuckDuckGoHtmlProvider()];
}

export function createSearchProvider(): SearchProvider {
  const limits = getScoutLimits();
  const configuredProvider = getSearchProviderName();

  return {
    search(intent) {
      return acquireCandidates({
        intent,
        limits,
        liveProviders: resolveLiveProviders(configuredProvider),
        useFallbackOnly: configuredProvider === "seeded_stub",
        fallbackProvider: createSeededFallbackProvider(intent)
      });
    }
  };
}
