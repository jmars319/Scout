import * as cheerio from "cheerio";

import type {
  ProviderSearchCandidate,
  ProviderSearchResponse,
  SearchProviderAdapter
} from "./provider-types.ts";
import type { InteractiveBrowserSearchSession } from "./interactive-browser.ts";

const REQUEST_TIMEOUT_MS = 12_000;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BLOCK_MARKERS = [
  "our systems have detected unusual traffic from your computer network",
  "this page checks to see if it's really you sending the requests, and not a robot",
  "g-recaptcha",
  "captcha-form",
  "recaptcha"
];
const JS_SHELL_MARKERS = [
  "please click here if you are not redirected within a few seconds",
  "/httpservice/retry/enablejs",
  "enable javascript on your web browser"
];
const EMPTY_MARKERS = [
  "did not match any documents",
  "your search did not match any documents",
  "no results found for",
  "try different keywords"
];
const RESULT_CONTAINER_SELECTORS = [
  "div.yuRUbf",
  "div.g",
  "div.tF2Cxc",
  "div.MjjYud",
  "div[data-snc]"
];
const SNIPPET_SELECTORS = [
  "div.VwiC3b",
  "div.s3v9rd",
  "span.aCOpRe",
  "div[data-sncf='1']"
];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isGoogleInternalUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    return (
      hostname === "google.com" ||
      hostname.endsWith(".google.com") ||
      hostname === "googleadservices.com" ||
      hostname.endsWith(".googleadservices.com") ||
      hostname === "webcache.googleusercontent.com"
    );
  } catch {
    return false;
  }
}

function finalizeResultUrl(value: string): string | null {
  return isGoogleInternalUrl(value) ? null : value;
}

function decodeGoogleRedirect(href: string): string | null {
  try {
    const url = new URL(href, "https://www.google.com");
    const target = url.searchParams.get("q") ?? url.searchParams.get("url");
    if (!target) {
      return null;
    }

    return finalizeResultUrl(target);
  } catch {
    return null;
  }
}

function normalizeResultUrl(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  if (href.startsWith("/url?")) {
    return decodeGoogleRedirect(href);
  }

  if (
    href.startsWith("https://www.google.com/url?") ||
    href.startsWith("http://www.google.com/url?")
  ) {
    return decodeGoogleRedirect(href);
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

function detectBlockedPage(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of BLOCK_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "Google Search responded with an anti-bot or human-verification page.";
    }
  }

  return null;
}

function detectBrowserOnlyShell(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of JS_SHELL_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "Google Search returned a JavaScript shell that Scout can only continue through a browser-rendered session.";
    }
  }

  return null;
}

function detectEmptyPage(bodyText: string): string | null {
  const lowerBody = bodyText.toLowerCase();

  for (const marker of EMPTY_MARKERS) {
    if (lowerBody.includes(marker)) {
      return "Google Search returned no results for this query.";
    }
  }

  return null;
}

function extractCandidates(html: string, limit: number): ProviderSearchCandidate[] {
  const $ = cheerio.load(html);
  const candidates: ProviderSearchCandidate[] = [];
  const seenUrls = new Set<string>();
  const seenContainers = new Set<string>();

  for (const selector of RESULT_CONTAINER_SELECTORS) {
    $(selector).each((index, element) => {
      if (candidates.length >= limit) {
        return false;
      }

      const container = $(element);
      const containerKey = `${selector}:${index}:${normalizeWhitespace(container.text()).slice(0, 120)}`;
      if (seenContainers.has(containerKey)) {
        return;
      }

      const anchor = container.find("a[href]").filter((_, link) => {
        const candidate = $(link);
        return candidate.find("h3").length > 0;
      }).first();

      if (!anchor.length) {
        return;
      }

      const normalizedUrl = normalizeResultUrl(anchor.attr("href"));
      if (!normalizedUrl || !isSupportedResultUrl(normalizedUrl) || seenUrls.has(normalizedUrl)) {
        return;
      }

      const title = normalizeWhitespace(anchor.find("h3").first().text()) || normalizedUrl;
      if (!title) {
        return;
      }

      seenContainers.add(containerKey);
      seenUrls.add(normalizedUrl);
      let snippet = "";
      for (const snippetSelector of SNIPPET_SELECTORS) {
        const candidateSnippet = normalizeWhitespace(
          container.find(snippetSelector).first().text()
        );
        if (candidateSnippet) {
          snippet = candidateSnippet;
          break;
        }
      }

      candidates.push({
        title,
        url: normalizedUrl,
        snippet,
        source: "google_html"
      });
    });

    if (candidates.length > 0) {
      break;
    }
  }

  return candidates;
}

export function parseGoogleHtmlSearchPage(
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

  const browserOnlyShellMessage = detectBrowserOnlyShell(bodyText);
  if (browserOnlyShellMessage) {
    return {
      outcome: "parse_error",
      candidates: [],
      detail: browserOnlyShellMessage
    };
  }

  return {
    outcome: "parse_error",
    candidates: [],
    detail: "Google Search returned a page Scout could not parse into search candidates."
  };
}

function describeNetworkFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") {
      return "Google Search timed out before returning search results.";
    }

    if (error.name === "AbortError") {
      return "Google Search request was aborted before Scout received a response.";
    }

    return `Google Search request failed: ${error.message}`;
  }

  return "Google Search request failed before Scout received a response.";
}

function classifyHttpStatus(status: number): ProviderSearchResponse {
  if (status === 403 || status === 418 || status === 429 || status >= 500) {
    return {
      outcome: "blocked",
      candidates: [],
      detail: `Google Search responded with ${status}, which Scout treats as provider degradation.`,
      httpStatus: status
    };
  }

  return {
    outcome: "http_error",
    candidates: [],
    detail: `Google Search responded with ${status}.`,
    httpStatus: status
  };
}

function buildSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=10&pws=0`;
}

async function runFetchQuery(query: string): Promise<Response> {
  return fetch(buildSearchUrl(query), {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache",
      "upgrade-insecure-requests": "1",
      "user-agent": BROWSER_USER_AGENT
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
}

function shouldEscalateToInteractiveSearch(response: ProviderSearchResponse): boolean {
  return (
    response.outcome === "blocked" ||
    (response.outcome === "parse_error" &&
      response.detail?.includes("browser-rendered session") === true)
  );
}

export function createGoogleHtmlProvider(options?: {
  interactiveSession?: InteractiveBrowserSearchSession | null;
}): SearchProviderAdapter {
  const interactiveSession = options?.interactiveSession ?? null;
  let browserBackedMode = false;

  return {
    name: "google_html",
    kind: "live",
    async executeQuery(query, limit) {
      if (browserBackedMode && interactiveSession) {
        return interactiveSession.search({
          providerName: "Google Search",
          query,
          limit,
          searchUrl: buildSearchUrl(query),
          parsePage: parseGoogleHtmlSearchPage
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
      const parsed = parseGoogleHtmlSearchPage(html, limit);

      if (!interactiveSession || !shouldEscalateToInteractiveSearch(parsed)) {
        return parsed;
      }

      const browserResponse = await interactiveSession.search({
        providerName: "Google Search",
        query,
        limit,
        searchUrl: buildSearchUrl(query),
        parsePage: parseGoogleHtmlSearchPage
      });

      if (browserResponse.outcome === "success" || browserResponse.outcome === "empty") {
        browserBackedMode = true;
      }

      return browserResponse;
    }
  };
}
