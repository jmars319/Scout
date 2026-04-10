import * as cheerio from "cheerio";

import type { ProviderSearchCandidate } from "./provider-types.ts";

function normalizeResultUrl(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  if (href.includes("uddg=")) {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : null;
  }

  if (href.startsWith("//")) {
    return `https:${href}`;
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  return null;
}

export async function searchDuckDuckGoHtml(
  query: string,
  limit: number
): Promise<ProviderSearchCandidate[]> {
  const response = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "Scout/0.1 (+https://example.com/scout)"
    },
    body: new URLSearchParams({
      q: query
    }),
    signal: AbortSignal.timeout(12_000)
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo HTML search failed with ${response.status}.`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const candidates: ProviderSearchCandidate[] = [];

  $(".result").each((index, element) => {
    if (candidates.length >= limit) {
      return false;
    }

    const anchor = $(element).find(".result__title a").first();
    const normalizedUrl = normalizeResultUrl(anchor.attr("href"));

    if (!normalizedUrl) {
      return;
    }

    candidates.push({
      title: anchor.text().trim() || normalizedUrl,
      url: normalizedUrl,
      snippet: $(element).find(".result__snippet").text().trim(),
      source: "duckduckgo_html"
    });
  });

  return candidates;
}
