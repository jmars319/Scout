import { getScoutLimits, getSearchProviderName } from "@scout/config";
import type { ResolvedMarketIntent, ScoutAcquisitionResult } from "@scout/domain";

import { acquireCandidates } from "./acquisition.ts";
import { searchDuckDuckGoHtml } from "./duckduckgo-provider.ts";
import { searchSeededFallback } from "./seeded-provider.ts";

export interface SearchProvider {
  search: (intent: ResolvedMarketIntent) => Promise<ScoutAcquisitionResult>;
}

export function createSearchProvider(): SearchProvider {
  const limits = getScoutLimits();
  const configuredProvider = getSearchProviderName();

  return {
    search(intent) {
      if (configuredProvider === "seeded_stub") {
        return acquireCandidates({
          intent,
          limits,
          provider: {
            name: "seeded_stub",
            search: () => Promise.resolve([])
          },
          useFallbackOnly: true,
          fallbackSearch: searchSeededFallback
        });
      }

      return acquireCandidates({
        intent,
        limits,
        provider: {
          name: "duckduckgo_html",
          search: searchDuckDuckGoHtml
        },
        fallbackSearch: searchSeededFallback
      });
    }
  };
}
