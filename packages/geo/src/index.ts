import { SCOUT_CITY_STATE_SUGGESTIONS, STATE_NAME_TO_CODE } from "./locations.ts";

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
  "DC",
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

const LOCATION_SUGGESTION_LOOKUP = new Map(
  SCOUT_CITY_STATE_SUGGESTIONS.map((location) => [location.toLowerCase(), location])
);
const REGION_TOKENS = [
  ...new Set([
    ...[...STATE_CODES],
    ...STATE_NAME_TO_CODE.keys()
  ])
].sort((left, right) => right.length - left.length);

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((segment) =>
      segment
        .split("-")
        .map((part) =>
          part
            .split("'")
            .map((piece) => {
              if (!piece) {
                return piece;
              }

              return piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase();
            })
            .join("'")
        )
        .join("-")
    )
    .join(" ");
}

function normalizeRegion(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const cleaned = value.replace(/\./g, "").trim();
  const uppercase = cleaned.toUpperCase();
  if (STATE_CODES.has(uppercase)) {
    return uppercase;
  }

  return STATE_NAME_TO_CODE.get(cleaned.toLowerCase()) ?? toTitleCase(cleaned);
}

function splitLocationParts(cleaned: string): { city?: string; region?: string } {
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      ...(parts[0] ? { city: parts[0] } : {}),
      region: parts.slice(1).join(" ")
    };
  }

  const lowered = cleaned.toLowerCase();
  for (const token of REGION_TOKENS) {
    if (!lowered.endsWith(` ${token.toLowerCase()}`)) {
      continue;
    }

    return {
      city: cleaned.slice(0, -token.length).trim(),
      region: token
    };
  }

  return {
    ...(cleaned ? { city: cleaned } : {})
  };
}

function normalizeLocationParts(raw: string): NormalizedLocationHint {
  const cleaned = raw.replace(/\s+/g, " ").replace(/[.,]+$/g, "").trim();
  const parts = splitLocationParts(cleaned);
  const city = parts.city ? toTitleCase(parts.city) : undefined;
  const region = normalizeRegion(parts.region);
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

export function normalizeStructuredLocationInput(rawLocation: string): string {
  const cleaned = rawLocation.trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return "";
  }

  const suggested = LOCATION_SUGGESTION_LOOKUP.get(cleaned.toLowerCase());
  if (suggested) {
    return suggested;
  }

  const normalized = normalizeLocationParts(cleaned).normalized;
  return normalized || toTitleCase(cleaned);
}

export { SCOUT_CITY_STATE_SUGGESTIONS };
