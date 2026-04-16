import assert from "node:assert/strict";

import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { acquireCandidates } from "../apps/webapp/src/lib/server/search/acquisition.ts";
import { parseBingHtmlSearchPage } from "../apps/webapp/src/lib/server/search/bing-provider.ts";
import { parseDuckDuckGoHtmlSearchPage } from "../apps/webapp/src/lib/server/search/duckduckgo-provider.ts";
import { parseGoogleHtmlSearchPage } from "../apps/webapp/src/lib/server/search/google-provider.ts";
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

  const challengeHtml = `
    <html>
      <body>
        <div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div>
        <div class="anomaly-modal__description">
          Please complete the following challenge to confirm this search was made by a human.
        </div>
      </body>
    </html>
  `;
  const parsedChallenge = parseDuckDuckGoHtmlSearchPage(challengeHtml, 5);
  assert.equal(parsedChallenge.outcome, "blocked");

  const internalDuckDuckGoHtml = `
    <html>
      <body>
        <div class="result">
          <h2 class="result__title">
            <a class="result__a" href="https://duckduckgo.com/duckduckgo-help-pages/company/ads-by-microsoft-on-duckduckgo-private-search">
              more info
            </a>
          </h2>
        </div>
        <div class="result">
          <h2 class="result__title">
            <a class="result__a" href="/l/?uddg=https%3A%2F%2Fmoserlandscapingnc.com%2F">
              Moser Landscaping and Lawn Management in Winston-Salem, NC
            </a>
          </h2>
        </div>
        <div class="result">
          <h2 class="result__title">
            <a
              class="result__a"
              href="/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Dangi.com%26u3%3Dhttps%253A%252F%252Frequest.angi.com%252Fservice-request"
            >
              List Of Landscapers Near Me - Just Enter Your Zip Code
            </a>
          </h2>
        </div>
      </body>
    </html>
  `;
  const parsedInternalDuckDuckGo = parseDuckDuckGoHtmlSearchPage(internalDuckDuckGoHtml, 5);
  assert.equal(parsedInternalDuckDuckGo.outcome, "success");
  assert.equal(parsedInternalDuckDuckGo.candidates.length, 1);
  assert.equal(parsedInternalDuckDuckGo.candidates[0]?.url, "https://moserlandscapingnc.com/");

  const bingSuccessHtml = `
    <html>
      <body>
        <ol id="b_results">
          <li class="b_algo">
            <h2>
              <a href="https://www.bing.com/ck/a?!&u=a1aHR0cHM6Ly9tb3NlcmxhbmRzY2FwaW5nbmMuY29tLw">
                Moser Landscaping and Lawn Management in Winston-Salem, NC
              </a>
            </h2>
            <div class="b_caption">
              <p>Residential and commercial landscaping services.</p>
            </div>
          </li>
        </ol>
      </body>
    </html>
  `;
  const parsedBingSuccess = parseBingHtmlSearchPage(bingSuccessHtml, 5);
  assert.equal(parsedBingSuccess.outcome, "success");
  assert.equal(parsedBingSuccess.candidates.length, 1);
  assert.equal(parsedBingSuccess.candidates[0]?.url, "https://moserlandscapingnc.com/");

  const googleSuccessHtml = `
    <html>
      <body>
        <div id="search">
          <div class="MjjYud">
            <div class="yuRUbf">
              <a href="/url?q=https%3A%2F%2Fmoserlandscapingnc.com%2F&sa=U&ved=2ah">
                <h3>Moser Landscaping and Lawn Management in Winston-Salem, NC</h3>
              </a>
            </div>
            <div class="VwiC3b">Residential and commercial landscaping services.</div>
          </div>
        </div>
      </body>
    </html>
  `;
  const parsedGoogleSuccess = parseGoogleHtmlSearchPage(googleSuccessHtml, 5);
  assert.equal(parsedGoogleSuccess.outcome, "success");
  assert.equal(parsedGoogleSuccess.candidates.length, 1);
  assert.equal(parsedGoogleSuccess.candidates[0]?.url, "https://moserlandscapingnc.com/");

  const googleBlockedHtml = `
    <html>
      <body>
        <div>About this page</div>
        <div>
          Our systems have detected unusual traffic from your computer network. This page checks to
          see if it's really you sending the requests, and not a robot.
        </div>
        <form id="captcha-form"></form>
      </body>
    </html>
  `;
  const parsedGoogleBlocked = parseGoogleHtmlSearchPage(googleBlockedHtml, 5);
  assert.equal(parsedGoogleBlocked.outcome, "blocked");

  const googleShellHtml = `
    <html>
      <body>
        <noscript>
          <div>Please click <a href="/httpservice/retry/enablejs">here</a> if you are not redirected within a few seconds.</div>
          <div>In order to continue, please enable javascript on your web browser.</div>
        </noscript>
      </body>
    </html>
  `;
  const parsedGoogleShell = parseGoogleHtmlSearchPage(googleShellHtml, 5);
  assert.equal(parsedGoogleShell.outcome, "parse_error");
  assert(
    parsedGoogleShell.detail?.includes("browser-rendered session"),
    "Expected Google JS shell to describe browser-rendered recovery."
  );

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

  const confirmedIntent = resolveMarketIntent({
    rawQuery: "landscaping companies in Winston-Salem, NC"
  });
  const manualConfirmationAcquisition = await acquireCandidates({
    intent: confirmedIntent,
    limits: {
      minCandidates: 1,
      maxCandidates: 3
    },
    liveProviders: [
      {
        name: "duckduckgo_html",
        kind: "live",
        executeQuery() {
          return Promise.resolve({
            outcome: "success",
            candidates: [
              {
                title: "Moser Landscaping",
                url: "https://moserlandscapingnc.com/",
                snippet: "Local landscaping services.",
                source: "duckduckgo_html"
              }
            ],
            detail: "Scout continued through an in-browser session after manual human confirmation."
          });
        }
      }
    ]
  });

  assert.equal(manualConfirmationAcquisition.candidates.length, 1);
  assert(
    manualConfirmationAcquisition.diagnostics.notes.some((note) =>
      note.includes("required in-browser human confirmation")
    )
  );

  console.log("Provider verification passed.");
}

await main();
