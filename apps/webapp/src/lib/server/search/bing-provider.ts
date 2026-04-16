import * as cheerio from "cheerio";

import type {
  ProviderSearchCandidate,
  ProviderSearchResponse,
  SearchProviderAdapter
} from "./provider-types.ts";

const REQUEST_TIMEOUT_MS = 12_000;
const BING_RESULT_SELECTOR = "li.b_algo h2 a";
const BLOCK_MARKERS = [
  "unusual traffic",
  "verify you are human",
  "enter the characters you see below",
  "our systems have detected"
];
const EMPTY_MARKERS = [
  "there are no results for",
  "did not match any documents",
  "no results found"
];
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function decodeBingTarget(href: string): string | null {
  try {
    const url = new URL(href, "https://www.bing.com");
    const encoded = url.searchParams.get("u");

    if (!encoded) {
      return null;
    }

    if (encoded.startsWith("a1")) {
      const base64 = encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(base64, "base64").toString("utf8");
    }

    return encoded;
  } catch {
    return null;
  }
}

function normalizeResultUrl(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  if (href.startsWith("//")) {
    return `https:${href}`;
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    if (href.includes("bing.com/ck/a")) {
      return decodeBingTarget(href);
    }

    return href;
  }

  if (href.startsWith("/ck/a")) {
    return decodeBingTarget(`https://www.bing.com${href}`);
  }

  return null;
}

function isSupportedResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    return !parsed.hostname.toLowerCase().endsWith("bing.com");
  } catch {
    return false;
  }
}

function buildSnippet($: cheerio.CheerioAPI, element: unknown): string {
  const row = $(element as never).closest("li.b_algo");
  return normalizeWhitespace(row.find(".b_caption p").first().text());
}

function detectBlockedPage(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of BLOCK_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "Bing HTML responded with an anti-bot or degraded access page.";
    }
  }

  return null;
}

function detectEmptyPage(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of EMPTY_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "Bing HTML returned no results for this query.";
    }
  }

  return null;
}

export function parseBingHtmlSearchPage(
  html: string,
  limit: number
): ProviderSearchResponse {
  const $ = cheerio.load(html);
  const bodyText = normalizeWhitespace($.root().text());
  const blockedMessage = detectBlockedPage(bodyText);

  if (blockedMessage) {
    return {
      outcome: "blocked",
      candidates: [],
      detail: blockedMessage
    };
  }

  const candidates: ProviderSearchCandidate[] = [];
  const seenUrls = new Set<string>();

  $(BING_RESULT_SELECTOR).each((_, element) => {
    if (candidates.length >= limit) {
      return false;
    }

    const anchor = $(element);
    const normalizedUrl = normalizeResultUrl(anchor.attr("href"));

    if (!normalizedUrl || !isSupportedResultUrl(normalizedUrl) || seenUrls.has(normalizedUrl)) {
      return;
    }

    seenUrls.add(normalizedUrl);
    candidates.push({
      title: normalizeWhitespace(anchor.text()) || normalizedUrl,
      url: normalizedUrl,
      snippet: buildSnippet($, element),
      source: "bing_html"
    });
  });

  if (candidates.length > 0) {
    return {
      outcome: "success",
      candidates
    };
  }

  const emptyMessage = detectEmptyPage(bodyText);
  if (emptyMessage) {
    return {
      outcome: "empty",
      candidates: [],
      detail: emptyMessage
    };
  }

  return {
    outcome: "parse_error",
    candidates: [],
    detail: "Bing HTML returned a page Scout could not parse into search candidates."
  };
}

function describeNetworkFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return "Bing HTML timed out before returning search results.";
    }

    if (error.name === "AbortError") {
      return "Bing HTML request was aborted before Scout received a response.";
    }

    return `Bing HTML request failed: ${error.message}`;
  }

  return "Bing HTML request failed before Scout received a response.";
}

function classifyHttpStatus(status: number): ProviderSearchResponse {
  if (status === 403 || status === 418 || status === 429 || status >= 500) {
    return {
      outcome: "blocked",
      candidates: [],
      detail: `Bing HTML responded with ${status}, which Scout treats as provider degradation.`,
      httpStatus: status
    };
  }

  return {
    outcome: "http_error",
    candidates: [],
    detail: `Bing HTML responded with ${status}.`,
    httpStatus: status
  };
}

export function createBingHtmlProvider(): SearchProviderAdapter {
  return {
    name: "bing_html",
    kind: "live",
    async executeQuery(query, limit) {
      let response: Response;

      try {
        response = await fetch(`https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache",
            "user-agent": BROWSER_USER_AGENT
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
      } catch (error) {
        return {
          outcome: "network_error",
          candidates: [],
          detail: describeNetworkFailure(error)
        };
      }

      if (!response.ok) {
        return classifyHttpStatus(response.status);
      }

      const html = await response.text();
      return parseBingHtmlSearchPage(html, limit);
    }
  };
}
