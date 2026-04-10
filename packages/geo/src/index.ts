export interface NormalizedLocationHint {
  raw: string;
  normalized: string;
  city?: string;
  region?: string;
  proximity?: "in" | "near";
}

const STATE_CODES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY"
]);

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function normalizeLocationParts(raw: string): NormalizedLocationHint {
  const cleaned = raw.replace(/\s+/g, " ").replace(/[.,]+$/g, "").trim();
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts[0] ? toTitleCase(parts[0]) : undefined;
  const regionCandidate = parts[1]?.toUpperCase();
  const region = regionCandidate && STATE_CODES.has(regionCandidate) ? regionCandidate : parts[1];
  const normalized = [city, region].filter(Boolean).join(", ");
  const location: NormalizedLocationHint = {
    raw,
    normalized
  };

  if (city) {
    location.city = city;
  }

  if (region) {
    location.region = region;
  }

  return location;
}

export function normalizeLocationHint(rawQuery: string): NormalizedLocationHint | null {
  const query = rawQuery.trim();
  const nearMatch = query.match(/\b(near|in)\s+([a-z0-9][a-z0-9\s,.'-]+)$/i);
  if (nearMatch?.[2]) {
    const proximity = nearMatch[1] && nearMatch[1].toLowerCase() === "near" ? "near" : "in";
    return {
      ...normalizeLocationParts(nearMatch[2]),
      proximity
    };
  }

  const trailingLocationMatch = query.match(/,\s*([a-z0-9][a-z0-9\s.'-]+(?:,\s*[a-z]{2})?)$/i);
  if (trailingLocationMatch?.[1]) {
    return normalizeLocationParts(trailingLocationMatch[1]);
  }

  return null;
}

export function stripLocationHint(rawQuery: string): string {
  const query = rawQuery.trim();
  return query.replace(/\b(near|in)\s+([a-z0-9][a-z0-9\s,.'-]+)$/i, "").replace(/,\s*([a-z0-9][a-z0-9\s.'-]+(?:,\s*[a-z]{2})?)$/i, "").trim();
}
