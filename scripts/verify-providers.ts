import assert from "node:assert/strict";

import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { acquireCandidates } from "../apps/webapp/src/lib/server/search/acquisition.ts";
import { parseDuckDuckGoHtmlSearchPage } from "../apps/webapp/src/lib/server/search/duckduckgo-provider.ts";
import type { SearchProviderAdapter } from "../apps/webapp/src/lib/server/search/provider-types.ts";

function createLiveProvider(): SearchProviderAdapter {
  return {
    name: "duckduckgo_html",
    kind: "live",
    executeQuery(query) {
      if (query === "dentists in Columbus, OH") {
        return Promise.resolve({
          outcome: "network_error",
          candidates: [],
          detail: "DuckDuckGo HTML timed out before returning search results."
        });
      }

      if (query === "dentists Columbus, OH") {
        return Promise.resolve({
          outcome: "success",
          candidates: [
            {
              title: "Aspen Dental",
              url: "https://www.aspendental.com",
              snippet: "Dental practice website with appointment flows.",
              source: "duckduckgo_html"
            }
          ]
        });
      }

      return Promise.resolve({
        outcome: "empty",
        candidates: [],
        detail: "DuckDuckGo HTML returned no results for this query."
      });
    }
  };
}

function createFallbackProvider(): SearchProviderAdapter {
  return {
    name: "seeded_stub",
    kind: "fallback",
    executeQuery() {
      return Promise.resolve({
        outcome: "success",
        candidates: [
          {
            title: "Gentle Dental",
            url: "https://www.gentledental.com",
            snippet: "Dentistry brand website.",
            source: "seeded_stub"
          },
          {
            title: "Western Dental",
            url: "https://www.westerndental.com",
            snippet: "Dental care website.",
            source: "seeded_stub"
          },
          {
            title: "Perfect Teeth",
            url: "https://www.perfectteeth.com",
            snippet: "Dental office website.",
            source: "seeded_stub"
          }
        ]
      });
    }
  };
}

async function main(): Promise<void> {
  const successHtml = `
    <html>
      <body>
        <div class="result">
          <h2 class="result__title">
            <a class="result__a" href="/l/?uddg=https%3A%2F%2Fwww.example.com%2Fservices%3Futm_source%3Dddg">
              Example Dental
            </a>
          </h2>
          <a class="result__snippet">Official dental website.</a>
        </div>
      </body>
    </html>
  `;
  const parsedSuccess = parseDuckDuckGoHtmlSearchPage(successHtml, 5);
  assert.equal(parsedSuccess.outcome, "success");
  assert.equal(parsedSuccess.candidates.length, 1);
  assert.equal(parsedSuccess.candidates[0]?.url, "https://www.example.com/services?utm_source=ddg");

  const blockedHtml = `<html><body>We detected automated requests and unusual traffic.</body></html>`;
  const parsedBlocked = parseDuckDuckGoHtmlSearchPage(blockedHtml, 5);
  assert.equal(parsedBlocked.outcome, "blocked");

  const emptyHtml = `<html><body>No results found for your search.</body></html>`;
  const parsedEmpty = parseDuckDuckGoHtmlSearchPage(emptyHtml, 5);
  assert.equal(parsedEmpty.outcome, "empty");

  const parseFailureHtml = `<html><body><div>DuckDuckGo changed the page shape.</div></body></html>`;
  const parsedFailure = parseDuckDuckGoHtmlSearchPage(parseFailureHtml, 5);
  assert.equal(parsedFailure.outcome, "parse_error");

  const intent = resolveMarketIntent({
    rawQuery: "dentists in Columbus, OH"
  });
  const acquisition = await acquireCandidates({
    intent,
    limits: {
      minCandidates: 3,
      maxCandidates: 4
    },
    liveProviders: [createLiveProvider()],
    fallbackProvider: createFallbackProvider()
  });

  assert.equal(acquisition.diagnostics.fallbackUsed, true);
  assert.equal(acquisition.diagnostics.liveCandidateCount, 1);
  assert.equal(acquisition.diagnostics.fallbackCandidateCount, 3);
  assert(
    acquisition.diagnostics.providerAttempts.some(
      (attempt) =>
        attempt.provider === "duckduckgo_html" && attempt.outcome === "network_error"
    )
  );
  assert(
    acquisition.diagnostics.providerAttempts.some(
      (attempt) => attempt.provider === "duckduckgo_html" && attempt.outcome === "empty"
    )
  );
  assert(
    acquisition.diagnostics.providerAttempts.some(
      (attempt) => attempt.provider === "seeded_stub" && attempt.kind === "fallback"
    )
  );
  assert(
    acquisition.diagnostics.fallbackTriggers.some(
      (trigger) => trigger.reason === "insufficient_live_candidates"
    )
  );
  assert(
    acquisition.diagnostics.fallbackTriggers.some(
      (trigger) => trigger.reason === "provider_network_error"
    )
  );
  assert(
    acquisition.diagnostics.fallbackTriggers.some((trigger) => trigger.reason === "provider_empty")
  );

  const duckSource = acquisition.diagnostics.candidateSources.find(
    (source) => source.source === "duckduckgo_html"
  );
  const fallbackSource = acquisition.diagnostics.candidateSources.find(
    (source) => source.source === "seeded_stub"
  );
  assert(duckSource);
  assert.equal(duckSource.selectedCandidateCount, 1);
  assert(fallbackSource);
  assert.equal(fallbackSource.selectedCandidateCount, 3);
  assert(
    acquisition.diagnostics.notes.some((note) => note.includes("Fallback candidates were used"))
  );
  assert(
    acquisition.diagnostics.notes.some((note) => note.includes("live provider attempt failed"))
  );

  console.log("Provider verification passed.");
}

await main();
