import type { ResolvedMarketIntent } from "../../../../../../packages/domain/src/model.ts";

export interface SearchQueryVariant {
  label: string;
  query: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function singularizeToken(token: string): string | null {
  const normalized = token.trim();

  if (normalized.length < 4 || normalized.endsWith("ss")) {
    return null;
  }

  if (normalized.endsWith("ies")) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (normalized.endsWith("s")) {
    return normalized.slice(0, -1);
  }

  return null;
}

function buildSingularizedMarketTerm(marketTerm: string): string | null {
  const tokens = normalizeWhitespace(marketTerm).split(" ");
  const lastToken = tokens.at(-1);

  if (!lastToken) {
    return null;
  }

  const singularized = singularizeToken(lastToken.toLowerCase());
  if (!singularized || singularized === lastToken.toLowerCase()) {
    return null;
  }

  return [...tokens.slice(0, -1), singularized].join(" ");
}

export function buildQueryVariants(intent: ResolvedMarketIntent): SearchQueryVariant[] {
  const variants: SearchQueryVariant[] = [
    {
      label: "raw",
      query: normalizeWhitespace(intent.originalQuery)
    },
    {
      label: "normalized",
      query: normalizeWhitespace(intent.searchQuery)
    }
  ];
  const singularizedMarketTerm = buildSingularizedMarketTerm(intent.marketTerm);

  if (singularizedMarketTerm) {
    variants.push({
      label: "singularized",
      query: normalizeWhitespace(
        intent.locationLabel ? `${singularizedMarketTerm} ${intent.locationLabel}` : singularizedMarketTerm
      )
    });
  }

  if (intent.locationLabel) {
    variants.push(
      {
        label: "official_website",
        query: normalizeWhitespace(`"${intent.marketTerm}" "${intent.locationLabel}" "official website"`)
      },
      {
        label: "contact_path",
        query: normalizeWhitespace(`"${intent.marketTerm}" "${intent.locationLabel}" contact`)
      },
      {
        label: "owned_domain",
        query: normalizeWhitespace(`site:*.com "${intent.marketTerm}" "${intent.locationLabel}"`)
      }
    );
  }

  const seen = new Set<string>();

  return variants.filter((variant) => {
    const key = variant.query.toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
