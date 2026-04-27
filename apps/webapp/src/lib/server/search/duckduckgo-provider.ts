import * as cheerio from "cheerio";
import type {
  ProviderSearchCandidate,
  ProviderSearchResponse,
  SearchProviderAdapter
} from "./provider-types.ts";
import type { InteractiveBrowserSearchSession } from "./interactive-browser.ts";

const REQUEST_TIMEOUT_MS = 12_000;
const RESULT_SELECTORS = [
  ".result .result__title a",
  ".result__title a.result__a",
  "a.result__a",
  ".links_main a"
];
const BLOCK_MARKERS = [
  "automated requests",
  "unusual traffic",
  "captcha",
  "verify you are human",
  "please enable javascript",
  "bots use duckduckgo too",
  "confirm this search was made by a human",
  "images not loading?",
  "error-lite@duckduckgo.com",
  "anomaly-modal"
];
const EMPTY_MARKERS = [
  "no results.",
  "no results found",
  "did not match any results",
  "could not find results"
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isDuckDuckGoInternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    return hostname === "duckduckgo.com" || hostname === "html.duckduckgo.com";
  } catch {
    return false;
  }
}

function finalizeResultUrl(value: string): string | null {
  return isDuckDuckGoInternalUrl(value) ? null : value;
}

function normalizeResultUrl(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  if (href.includes("uddg=")) {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    if (!target) {
      return null;
    }

    return finalizeResultUrl(decodeURIComponent(target));
  }

  if (href.startsWith("//")) {
    return finalizeResultUrl(`https:${href}`);
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return finalizeResultUrl(href);
  }

  return null;
}

function isSupportedResultUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildSnippet($: cheerio.CheerioAPI, element: unknown): string {
  const anchor = $(element as never);
  const container = anchor.closest(".result, .results_links, .web-result, .links_main");
  const snippet = normalizeWhitespace(
    container.find(".result__snippet, .result-snippet, .snippet").first().text()
  );

  if (snippet) {
    return snippet;
  }

  const nearbyText = normalizeWhitespace(
    anchor
      .parent()
      .siblings()
      .slice(0, 3)
      .text()
  );

  return nearbyText;
}

function collectAnchors($: cheerio.CheerioAPI): unknown[] {
  for (const selector of RESULT_SELECTORS) {
    const matches = $(selector);
    if (matches.length > 0) {
      return matches.toArray();
    }
  }

  return [];
}

function detectBlockedPage(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of BLOCK_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "DuckDuckGo HTML responded with an anti-bot or degraded access page.";
    }
  }

  return null;
}

function detectEmptyPage(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of EMPTY_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "DuckDuckGo HTML returned no results for this query.";
    }
  }

  return null;
}

function extractCandidates(html: string, limit: number): ProviderSearchCandidate[] {
  const $ = cheerio.load(html);
  const candidates: ProviderSearchCandidate[] = [];
  const seenUrls = new Set<string>();
  const anchors = collectAnchors($);

  for (const element of anchors) {
    if (candidates.length >= limit) {
      break;
    }

    const anchor = $(element as never);
    const normalizedUrl = normalizeResultUrl(anchor.attr("href"));
    if (!normalizedUrl || !isSupportedResultUrl(normalizedUrl)) {
      continue;
    }

    if (seenUrls.has(normalizedUrl)) {
      continue;
    }

    const title = normalizeWhitespace(anchor.text()) || normalizedUrl;
    const snippet = buildSnippet($, element);

    seenUrls.add(normalizedUrl);
    candidates.push({
      title,
      url: normalizedUrl,
      snippet,
      source: "duckduckgo_html"
    });
  }

  return candidates;
}

export function parseDuckDuckGoHtmlSearchPage(
  html: string,
  limit: number
): ProviderSearchResponse {
  const bodyText = normalizeWhitespace(cheerio.load(html).root().text());
  const blockedMessage = detectBlockedPage(bodyText);
  if (blockedMessage) {
    return {
      outcome: "blocked",
      candidates: [],
      detail: blockedMessage
    };
  }

  const candidates = extractCandidates(html, limit);
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
    detail: "DuckDuckGo HTML returned a page Scout could not parse into search candidates."
  };
}

function describeNetworkFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return "DuckDuckGo HTML timed out before returning search results.";
    }

    if (error.name === "AbortError") {
      return "DuckDuckGo HTML request was aborted before Scout received a response.";
    }

    return `DuckDuckGo HTML request failed: ${error.message}`;
  }

  return "DuckDuckGo HTML request failed before Scout received a response.";
}

function classifyHttpStatus(status: number): ProviderSearchResponse {
  if (status === 403 || status === 418 || status === 429 || status >= 500) {
    return {
      outcome: "blocked",
      candidates: [],
      detail: `DuckDuckGo HTML responded with ${status}, which Scout treats as provider degradation.`,
      httpStatus: status
    };
  }

  return {
    outcome: "http_error",
    candidates: [],
    detail: `DuckDuckGo HTML responded with ${status}.`,
    httpStatus: status
  };
}

function buildSearchUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

async function runFetchQuery(query: string): Promise<Response> {
  const browserUserAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  return fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "content-type": "application/x-www-form-urlencoded",
      pragma: "no-cache",
      origin: "https://html.duckduckgo.com",
      referer: buildSearchUrl(query),
      "user-agent": browserUserAgent
    },
    body: new URLSearchParams({
      q: query
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
}

export function createDuckDuckGoHtmlProvider(options?: {
  interactiveSession?: InteractiveBrowserSearchSession | null;
}): SearchProviderAdapter {
  const interactiveSession = options?.interactiveSession ?? null;
  let browserBackedMode = false;

  return {
    name: "duckduckgo_html",
    kind: "live",
    async executeQuery(query, limit, onProgress) {
      if (browserBackedMode && interactiveSession) {
        return interactiveSession.search({
          providerName: "DuckDuckGo HTML",
          query,
          limit,
          searchUrl: buildSearchUrl(query),
          parsePage: parseDuckDuckGoHtmlSearchPage,
          ...(onProgress ? { onProgress } : {})
        });
      }

      let response: Response;

      try {
        response = await runFetchQuery(query);
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
      const parsed = parseDuckDuckGoHtmlSearchPage(html, limit);

      if (parsed.outcome !== "blocked" || !interactiveSession) {
        return parsed;
      }

      await onProgress?.(
        "DuckDuckGo requested human confirmation in a browser window. Complete it there to continue."
      );
      const browserResponse = await interactiveSession.search({
        providerName: "DuckDuckGo HTML",
        query,
        limit,
        searchUrl: buildSearchUrl(query),
        parsePage: parseDuckDuckGoHtmlSearchPage,
        ...(onProgress ? { onProgress } : {})
      });

      if (browserResponse.outcome === "success" || browserResponse.outcome === "empty") {
        browserBackedMode = true;
      }

      return browserResponse;
    },
  };
}
