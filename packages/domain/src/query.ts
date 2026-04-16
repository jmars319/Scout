import { normalizeLocationHint, stripLocationHint } from "@scout/geo";

import type { ResolvedMarketIntent, ScoutQueryInput } from "./model.ts";

const CATEGORY_PATTERNS: Array<[string, RegExp]> = [
  ["restaurant", /\b(restaurants?|brunch|cafes?|coffee|bars?|bakery|bakeries|pizza|bbq)\b/i],
  ["medical", /\b(dentists?|dental|doctors?|clinics?|orthodontists?|medspa|dermatology|health)\b/i],
  ["legal", /\b(lawyers?|attorneys?|law firm|legal)\b/i],
  ["fitness", /\b(gyms?|fitness|pilates|yoga|trainers?)\b/i],
  ["beauty", /\b(salons?|spas?|barbers?|beauty|lashes|nails)\b/i],
  ["home_services", /\b(hvac|roofing|plumbing|electricians?|landscaping|contractors?|remodel)\b/i],
  ["auto", /\b(auto|mechanics?|detailing|collision|tires?)\b/i],
  ["real_estate", /\b(real estate|realtors?|brokerage|property management)\b/i],
  ["retail", /\b(stores?|shop|boutique|jewelers?|electronics?|computer|hardware|appliance|furniture|florist)\b/i],
  ["professional_services", /\b(accounting|accountants?|cpa|bookkeeping|tax|marketing|agency|web design|printing|sign shop|it services|computer repair)\b/i],
  ["financial", /\b(insurance|financial advisor|mortgage broker|bank|credit union)\b/i],
  ["pet", /\b(veterinary|vet|dog groomer|pet boarding|dog daycare|dog trainer|pet sitter)\b/i],
  ["education", /\b(preschool|daycare|childcare|montessori|tutoring|music school|driving school)\b/i],
  ["hospitality", /\b(hotels?|motels?|bed and breakfast|event venue)\b/i]
];

function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

export function resolveMarketIntent(input: ScoutQueryInput): ResolvedMarketIntent {
  const originalQuery = input.rawQuery.trim();
  const location = normalizeLocationHint(originalQuery);
  const marketTerm = stripLocationHint(originalQuery) || originalQuery;
  const normalizedQuery = normalizeQuery(marketTerm);
  const categories = CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(originalQuery)).map(([category]) => category);
  const intent: ResolvedMarketIntent = {
    originalQuery,
    normalizedQuery,
    marketTerm,
    categories: categories.length > 0 ? categories : ["general_local_business"],
    searchQuery: location?.normalized ? `${marketTerm} ${location.normalized}` : marketTerm
  };

  if (location?.normalized) {
    intent.locationLabel = location.normalized;
  }

  if (location?.city) {
    intent.locationCity = location.city;
  }

  if (location?.region) {
    intent.locationRegion = location.region;
  }

  return intent;
}
