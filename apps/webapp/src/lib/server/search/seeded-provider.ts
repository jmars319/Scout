import type { ResolvedMarketIntent } from "@scout/domain";

import type {
  ProviderSearchCandidate,
  ProviderSearchResponse,
  SearchProviderAdapter
} from "./provider-types.ts";

const CATALOG: Record<string, ProviderSearchCandidate[]> = {
  restaurant: [
    {
      title: "Blue Bottle Coffee",
      url: "https://bluebottlecoffee.com",
      snippet: "Coffee roaster and cafe brand.",
      source: "seeded_stub"
    },
    {
      title: "Sweetgreen",
      url: "https://www.sweetgreen.com",
      snippet: "Fast-casual restaurant brand with ordering and location pages.",
      source: "seeded_stub"
    },
    {
      title: "Joe Coffee Company",
      url: "https://joecoffeecompany.com",
      snippet: "Coffee shop brand website.",
      source: "seeded_stub"
    },
    {
      title: "Blue Bottle Coffee - Facebook",
      url: "https://www.facebook.com/bluebottlecoffee",
      snippet: "Facebook page for Blue Bottle Coffee.",
      source: "seeded_stub"
    },
    {
      title: "Sweetgreen - Yelp",
      url: "https://www.yelp.com/biz/sweetgreen-new-york",
      snippet: "Yelp listing for Sweetgreen.",
      source: "seeded_stub"
    },
    {
      title: "Restaurants - Yellow Pages",
      url: "https://www.yellowpages.com/search?search_terms=restaurants",
      snippet: "Directory listing result.",
      source: "seeded_stub"
    }
  ],
  medical: [
    {
      title: "Aspen Dental",
      url: "https://www.aspendental.com",
      snippet: "Dental practice website with locations and appointment flows.",
      source: "seeded_stub"
    },
    {
      title: "Gentle Dental",
      url: "https://www.gentledental.com",
      snippet: "Dentistry brand website.",
      source: "seeded_stub"
    },
    {
      title: "Western Dental",
      url: "https://www.westerndental.com",
      snippet: "Dental care website with service and appointment pages.",
      source: "seeded_stub"
    },
    {
      title: "Perfect Teeth",
      url: "https://www.perfectteeth.com",
      snippet: "Dental office website.",
      source: "seeded_stub"
    },
    {
      title: "Aspen Dental - Facebook",
      url: "https://www.facebook.com/AspenDental",
      snippet: "Facebook page for Aspen Dental.",
      source: "seeded_stub"
    },
    {
      title: "Dentists - Yelp",
      url: "https://www.yelp.com/search?find_desc=dentists",
      snippet: "Yelp search results for dentists.",
      source: "seeded_stub"
    },
    {
      title: "Dentists - Yellow Pages",
      url: "https://www.yellowpages.com/search?search_terms=dentists",
      snippet: "Directory listing result.",
      source: "seeded_stub"
    }
  ],
  legal: [
    {
      title: "Morgan & Morgan",
      url: "https://www.forthepeople.com",
      snippet: "Plaintiff-side law firm website.",
      source: "seeded_stub"
    },
    {
      title: "Morgan & Morgan - Facebook",
      url: "https://www.facebook.com/forthepeople",
      snippet: "Facebook page for Morgan & Morgan.",
      source: "seeded_stub"
    },
    {
      title: "Ben Crump Law",
      url: "https://bencrump.com",
      snippet: "Law firm website.",
      source: "seeded_stub"
    },
    {
      title: "Wilshire Law Firm",
      url: "https://wilshirelawfirm.com",
      snippet: "Personal injury law firm website.",
      source: "seeded_stub"
    },
    {
      title: "Lawyers - Yelp",
      url: "https://www.yelp.com/search?find_desc=lawyers",
      snippet: "Yelp search results for lawyers.",
      source: "seeded_stub"
    },
    {
      title: "Lawyers - Justia",
      url: "https://www.justia.com/lawyers",
      snippet: "Directory listing result.",
      source: "seeded_stub"
    }
  ],
  home_services: [
    {
      title: "Mr. Rooter Plumbing",
      url: "https://www.mrrooter.com",
      snippet: "Residential and commercial plumbing services.",
      source: "seeded_stub"
    },
    {
      title: "Mr. Rooter Plumbing - Yelp",
      url: "https://www.yelp.com/biz/mr-rooter-plumbing-san-francisco",
      snippet: "Yelp listing for Mr. Rooter Plumbing.",
      source: "seeded_stub"
    },
    {
      title: "One Hour Heating & Air Conditioning",
      url: "https://www.onehourheatandair.com",
      snippet: "HVAC service website.",
      source: "seeded_stub"
    },
    {
      title: "ARS/Rescue Rooter",
      url: "https://www.ars.com",
      snippet: "HVAC and plumbing service website.",
      source: "seeded_stub"
    },
    {
      title: "Mr. Rooter Plumbing - Facebook",
      url: "https://www.facebook.com/mrrooter",
      snippet: "Facebook page for Mr. Rooter Plumbing.",
      source: "seeded_stub"
    },
    {
      title: "Plumbers - Yellow Pages",
      url: "https://www.yellowpages.com/search?search_terms=plumbers",
      snippet: "Directory listing result.",
      source: "seeded_stub"
    }
  ],
  general_local_business: [
    {
      title: "The UPS Store",
      url: "https://www.theupsstore.com",
      snippet: "Franchise website with local store pages.",
      source: "seeded_stub"
    },
    {
      title: "Great Clips",
      url: "https://www.greatclips.com",
      snippet: "Salon and haircut chain website.",
      source: "seeded_stub"
    },
    {
      title: "SERVPRO",
      url: "https://www.servpro.com",
      snippet: "Home services brand website.",
      source: "seeded_stub"
    },
    {
      title: "Liberty Tax",
      url: "https://www.libertytax.com",
      snippet: "Tax preparation brand website.",
      source: "seeded_stub"
    },
    {
      title: "The UPS Store - Facebook",
      url: "https://www.facebook.com/theupsstore",
      snippet: "Facebook page for The UPS Store.",
      source: "seeded_stub"
    },
    {
      title: "Local Businesses - Yelp",
      url: "https://www.yelp.com/search?find_desc=local+businesses",
      snippet: "Directory listing result.",
      source: "seeded_stub"
    },
    {
      title: "Local Businesses - Yellow Pages",
      url: "https://www.yellowpages.com/search?search_terms=local+businesses",
      snippet: "Directory listing result.",
      source: "seeded_stub"
    }
  ]
};

function searchSeededFallback(
  intent: ResolvedMarketIntent,
  limit: number
): Promise<ProviderSearchCandidate[]> {
  const fallbackCatalog = CATALOG.general_local_business;
  if (!fallbackCatalog || fallbackCatalog.length === 0) {
    throw new Error("Seeded fallback catalog is empty.");
  }

  const category = intent.categories.find((value) => CATALOG[value]) || "general_local_business";
  const baseline = CATALOG[category] ?? fallbackCatalog;
  const repeated: ProviderSearchCandidate[] = [];

  for (let index = 0; index < limit; index += 1) {
    repeated.push(baseline[index % baseline.length]!);
  }

  return Promise.resolve(repeated);
}

export function createSeededFallbackProvider(
  intent: ResolvedMarketIntent
): SearchProviderAdapter & {
  executeQuery: (query: string, limit: number) => Promise<ProviderSearchResponse>;
} {
  return {
    name: "seeded_stub",
    kind: "fallback",
    async executeQuery(query, limit) {
      return {
        outcome: "success",
        candidates: await searchSeededFallback(
          {
            ...intent,
            searchQuery: query
          },
          limit
        )
      };
    }
  };
}
