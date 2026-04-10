import assert from "node:assert/strict";

import { resolveMarketIntent } from "../packages/domain/src/query.ts";
import { acquireCandidates } from "../apps/webapp/src/lib/server/search/acquisition.ts";
import { canonicalizeUrl } from "../apps/webapp/src/lib/server/search/canonicalize.ts";
import { buildQueryVariants } from "../apps/webapp/src/lib/server/search/query-variants.ts";

async function main(): Promise<void> {
  const canonical = canonicalizeUrl(
    "https://www.example.com/services/index.html?utm_source=ddg&ref=ads#top"
  );
  assert.equal(canonical.canonicalUrl, "https://example.com/services");

  const intent = resolveMarketIntent({
    rawQuery: "dentists in Columbus, OH"
  });
  const variants = buildQueryVariants(intent);
  assert(variants.some((variant) => variant.label === "raw"));
  assert(variants.some((variant) => variant.label === "normalized"));
  assert(variants.some((variant) => variant.label === "singularized"));

  const liveResults: Record<
    string,
    Array<{ title: string; url: string; snippet: string; source: string }>
  > = {
    "dentists in Columbus, OH": [
      {
        title: "Aspen Dental",
        url: "https://www.aspendental.com/?utm_source=ddg",
        snippet: "Dental practice website.",
        source: "duckduckgo_html"
      },
      {
        title: "Aspen Dental Official Site",
        url: "https://aspendental.com",
        snippet: "Official website.",
        source: "duckduckgo_html"
      },
      {
        title: "Dentists - Yelp",
        url: "https://www.yelp.com/search?find_desc=dentists",
        snippet: "Yelp search results.",
        source: "duckduckgo_html"
      },
      {
        title: "Gentle Dental - Facebook",
        url: "https://www.facebook.com/gentledental",
        snippet: "Facebook page.",
        source: "duckduckgo_html"
      }
    ],
    "dentists Columbus, OH": [
      {
        title: "Aspen Dental",
        url: "https://www.aspendental.com",
        snippet: "Dental practice website.",
        source: "duckduckgo_html"
      },
      {
        title: "Western Dental",
        url: "https://www.westerndental.com/",
        snippet: "Dental website.",
        source: "duckduckgo_html"
      },
      {
        title: "Perfect Teeth",
        url: "https://www.perfectteeth.com/index.html",
        snippet: "Dental office website.",
        source: "duckduckgo_html"
      }
    ],
    "dentist Columbus, OH": [
      {
        title: "Perfect Teeth",
        url: "https://www.perfectteeth.com/",
        snippet: "Dental office website.",
        source: "duckduckgo_html"
      }
    ]
  };

  const fallbackResults = [
    {
      title: "Fallback Dental",
      url: "https://www.fallbackdental.com/?utm_campaign=seeded",
      snippet: "Fallback website.",
      source: "seeded_stub"
    }
  ];

  const result = await acquireCandidates({
    intent,
    limits: {
      minCandidates: 5,
      maxCandidates: 6
    },
    provider: {
      name: "duckduckgo_html",
      search: (query: string) => Promise.resolve(liveResults[query] ?? [])
    },
    fallbackSearch: () => Promise.resolve(fallbackResults)
  });

  assert.equal(result.diagnostics.mergedDuplicateCount, 3);
  assert.equal(result.diagnostics.discardedCandidateCount, 1);
  assert.equal(result.diagnostics.fallbackUsed, true);
  assert.equal(result.diagnostics.selectedCandidateCount, 5);
  assert.equal(result.diagnostics.liveCandidateCount, 4);
  assert.equal(result.diagnostics.fallbackCandidateCount, 1);
  assert(
    result.candidates.some((candidate) => candidate.url === "https://example.com/services") ===
      false
  );
  assert(
    result.candidates.every((candidate) => !candidate.url.includes("utm_") && !candidate.url.endsWith("/index.html"))
  );
  assert(
    result.diagnostics.notes.some((note) => note.includes("Fallback candidates were used"))
  );
  assert(
    result.candidates.some((candidate) => candidate.url === "https://fallbackdental.com/")
  );

  console.log("Acquisition verification passed.");
}

await main();
