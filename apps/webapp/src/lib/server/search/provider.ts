import { getInteractiveSearchConfig, getScoutLimits, getSearchProviderName } from "@scout/config";
import type { AcquisitionDiagnostics, ResolvedMarketIntent, ScoutAcquisitionResult } from "@scout/domain";

import { createBingHtmlProvider } from "./bing-provider.ts";
import { acquireCandidates } from "./acquisition.ts";
import { createDuckDuckGoHtmlProvider } from "./duckduckgo-provider.ts";
import { createGoogleHtmlProvider } from "./google-provider.ts";
import { createInteractiveBrowserSearchSession } from "./interactive-browser.ts";
import type { SearchProviderAdapter } from "./provider-types.ts";
import { createSeededFallbackProvider } from "./seeded-provider.ts";

export interface SearchProvider {
  search: (intent: ResolvedMarketIntent) => Promise<ScoutAcquisitionResult>;
  dispose?: () => Promise<void>;
}

export class ScoutAcquisitionFailure extends Error {
  readonly diagnostics: AcquisitionDiagnostics;
  readonly searchSource: string;

  constructor(input: {
    message: string;
    diagnostics: AcquisitionDiagnostics;
    searchSource: string;
  }) {
    super(input.message);
    this.name = "ScoutAcquisitionFailure";
    this.diagnostics = input.diagnostics;
    this.searchSource = input.searchSource;
  }
}

function describeProviderFailure(result: ScoutAcquisitionResult): ScoutAcquisitionFailure {
  const attempts = result.diagnostics.providerAttempts.filter((attempt) => attempt.kind === "live");
  const attemptedProviders = [...new Set(attempts.map((attempt) => attempt.provider))];
  const timedOutManualConfirmation = attempts.some((attempt) =>
    attempt.detail?.includes("manual human confirmation in the browser, but the challenge was not completed before timeout")
  );
  const diagnostics: AcquisitionDiagnostics = {
    ...result.diagnostics,
    notes: [
      ...new Set([
        ...result.diagnostics.notes,
        "Scout intentionally stopped instead of substituting seeded candidates."
      ])
    ]
  };

  if (timedOutManualConfirmation) {
    return new ScoutAcquisitionFailure({
      message:
        "Scout opened a browser window for live search confirmation, but the challenge was not completed before timeout. No seeded results were substituted.",
      diagnostics,
      searchSource: attemptedProviders.join(" + ") || diagnostics.provider
    });
  }

  if (attempts.some((attempt) => attempt.outcome === "blocked")) {
    return new ScoutAcquisitionFailure({
      message:
        "Live acquisition was blocked before Scout could keep any usable candidates. No seeded results were substituted.",
      diagnostics,
      searchSource: attemptedProviders.join(" + ") || diagnostics.provider
    });
  }

  if (attempts.some((attempt) => attempt.outcome === "parse_error")) {
    return new ScoutAcquisitionFailure({
      message:
        "Live acquisition returned pages Scout could not parse into usable candidates. No seeded results were substituted.",
      diagnostics,
      searchSource: attemptedProviders.join(" + ") || diagnostics.provider
    });
  }

  if (
    attempts.some(
      (attempt) => attempt.outcome === "network_error" || attempt.outcome === "http_error"
    )
  ) {
    return new ScoutAcquisitionFailure({
      message:
        "Live acquisition failed before Scout could keep any usable candidates. No seeded results were substituted.",
      diagnostics,
      searchSource: attemptedProviders.join(" + ") || diagnostics.provider
    });
  }

  if (attempts.length > 0 && attempts.every((attempt) => attempt.outcome === "empty")) {
    return new ScoutAcquisitionFailure({
      message:
        "Live acquisition returned no usable candidates for this query. Scout did not substitute seeded results.",
      diagnostics,
      searchSource: attemptedProviders.join(" + ") || diagnostics.provider
    });
  }

  return new ScoutAcquisitionFailure({
    message:
      "Scout could not keep any usable live candidates for this run. No seeded results were substituted.",
    diagnostics,
    searchSource: attemptedProviders.join(" + ") || diagnostics.provider
  });
}

function resolveLiveProviders(
  configuredProvider: string,
  interactiveSession: ReturnType<typeof createInteractiveBrowserSearchSession> | null
): SearchProviderAdapter[] {
  if (configuredProvider === "seeded_stub") {
    return [];
  }

  if (configuredProvider === "google_html") {
    return [
      createGoogleHtmlProvider({
        interactiveSession
      }),
      createBingHtmlProvider()
    ];
  }

  return [
    createDuckDuckGoHtmlProvider({
      interactiveSession
    }),
    createGoogleHtmlProvider({
      interactiveSession
    }),
    createBingHtmlProvider()
  ];
}

export function createSearchProvider(): SearchProvider {
  const limits = getScoutLimits();
  const configuredProvider = getSearchProviderName();
  const interactiveSearch = getInteractiveSearchConfig();
  const interactiveSession =
    interactiveSearch.enabled && interactiveSearch.profileDir
      ? createInteractiveBrowserSearchSession(interactiveSearch)
      : null;
  const liveProviders = resolveLiveProviders(configuredProvider, interactiveSession);

  async function disposeProviders(): Promise<void> {
    for (const provider of liveProviders) {
      await provider.dispose?.();
    }

    await interactiveSession?.dispose();
  }

  return {
    async search(intent) {
      const result =
        configuredProvider === "seeded_stub"
          ? await acquireCandidates({
              intent,
              limits,
              liveProviders: [],
              useFallbackOnly: true,
              fallbackProvider: createSeededFallbackProvider(intent)
            })
          : await acquireCandidates({
              intent,
              limits,
              liveProviders
            });

      if (result.candidates.length === 0) {
        throw describeProviderFailure(result);
      }

      return result;
    },
    dispose: disposeProviders
  };
}
