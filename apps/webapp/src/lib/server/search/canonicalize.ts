const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "source",
  "src",
  "srsltid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term"
]);
const PROVIDER_SUFFIXES = [
  "facebook",
  "yelp",
  "yellow pages",
  "yellowpages",
  "justia",
  "tripadvisor",
  "official site",
  "official website",
  "homepage",
  "home"
] as const;

export interface CanonicalUrlRecord {
  canonicalUrl: string;
  canonicalHost: string;
  comparisonPath: string;
  comparisonKey: string;
}

function normalizePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/") || "/";
  const withoutIndex = collapsed.replace(/\/(index|default)\.(html?|php|asp[x]?)$/i, "/");

  if (withoutIndex.length > 1 && withoutIndex.endsWith("/")) {
    return withoutIndex.slice(0, -1);
  }

  return withoutIndex || "/";
}

function stripTrackingParams(url: URL): string {
  const retained = [...url.searchParams.entries()]
    .filter(([key, value]) => {
      if (!value.trim()) {
        return false;
      }

      return !TRACKING_QUERY_KEYS.has(key.toLowerCase());
    })
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

  return retained
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function canonicalizeUrl(rawUrl: string): CanonicalUrlRecord {
  const parsedUrl = new URL(rawUrl);
  const protocol = parsedUrl.protocol.toLowerCase();
  const canonicalHost = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const normalizedPath = normalizePathname(parsedUrl.pathname);
  const retainedQuery = stripTrackingParams(parsedUrl);
  const canonicalUrl = `${protocol}//${canonicalHost}${normalizedPath}${
    retainedQuery ? `?${retainedQuery}` : ""
  }`;

  return {
    canonicalUrl,
    canonicalHost,
    comparisonPath: normalizedPath.toLowerCase(),
    comparisonKey: `${canonicalHost}${normalizedPath.toLowerCase()}${
      retainedQuery ? `?${retainedQuery.toLowerCase()}` : ""
    }`
  };
}

export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBusinessKey(title: string): string {
  const baseTitle =
    title
      .split(/[-–|·•]/)
      .map((segment) => segment.trim())
      .find((segment) => {
        const normalized = normalizeTitle(segment);
        return normalized.length > 1 && !PROVIDER_SUFFIXES.includes(normalized as (typeof PROVIDER_SUFFIXES)[number]);
      }) ?? title;

  return normalizeTitle(baseTitle)
    .replace(/\b(official|website|site|reviews|review|hours|directions|locations?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeBusinessKey(value: string): string[] {
  return value.split(" ").filter((token) => token.length > 1);
}

export function titlesLookEquivalent(left: string, right: string): boolean {
  const leftKey = buildBusinessKey(left);
  const rightKey = buildBusinessKey(right);

  if (!leftKey || !rightKey) {
    return false;
  }

  if (leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey)) {
    return true;
  }

  const leftTokens = tokenizeBusinessKey(leftKey);
  const rightTokens = tokenizeBusinessKey(rightKey);
  const overlap = leftTokens.filter((token) => rightTokens.includes(token)).length;

  return overlap >= 2 && overlap >= Math.min(leftTokens.length, rightTokens.length) - 1;
}
