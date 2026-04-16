import {
  normalizeStructuredLocationInput,
  SCOUT_CITY_STATE_SUGGESTIONS
} from "@scout/geo";

const BUSINESS_TYPE_GROUPS = {
  home_services: [
    "roofing company",
    "plumbing company",
    "electrician",
    "hvac company",
    "landscaping company",
    "lawn care service",
    "tree service",
    "pest control company",
    "cleaning service",
    "house painter",
    "general contractor",
    "kitchen remodeler",
    "bathroom remodeler",
    "flooring contractor",
    "window contractor",
    "fence company",
    "pool contractor",
    "garage door company",
    "pressure washing service",
    "junk removal service",
    "handyman",
    "concrete contractor",
    "deck builder",
    "moving company",
    "locksmith",
    "foundation repair contractor",
    "insulation contractor",
    "solar installer",
    "water damage restoration service",
    "fire damage restoration service",
    "mold remediation company",
    "septic service",
    "well drilling service",
    "irrigation company",
    "hardscaping company",
    "siding contractor",
    "gutter contractor",
    "cabinet maker",
    "countertop installer",
    "security system installer",
    "home theater installer"
  ],
  medical: [
    "primary care clinic",
    "urgent care clinic",
    "pediatric clinic",
    "dermatology clinic",
    "chiropractic clinic",
    "physical therapy clinic",
    "med spa",
    "optometrist",
    "ophthalmologist",
    "orthopedic clinic",
    "mental health clinic",
    "counseling center",
    "therapy practice",
    "speech therapy clinic",
    "occupational therapy clinic",
    "hearing aid center",
    "allergy clinic",
    "cardiology clinic",
    "neurology clinic",
    "pain management clinic",
    "women's health clinic",
    "fertility clinic",
    "sleep clinic",
    "weight loss clinic",
    "vein clinic",
    "dialysis center"
  ],
  dental: [
    "dentist",
    "family dentist",
    "cosmetic dentist",
    "pediatric dentist",
    "orthodontist",
    "oral surgeon",
    "periodontist",
    "endodontist",
    "dental implant center",
    "emergency dentist",
    "prosthodontist"
  ],
  beauty: [
    "hair salon",
    "barber shop",
    "nail salon",
    "day spa",
    "massage therapist",
    "waxing salon",
    "tanning salon",
    "lash studio",
    "brow studio",
    "esthetician",
    "skin care clinic",
    "tattoo shop",
    "makeup artist",
    "bridal hair stylist",
    "bridal makeup artist",
    "med spa",
    "injectables clinic"
  ],
  fitness: [
    "gym",
    "personal trainer",
    "pilates studio",
    "yoga studio",
    "crossfit gym",
    "martial arts school",
    "dance studio",
    "indoor cycling studio",
    "boxing gym",
    "nutrition coach",
    "bootcamp gym",
    "climbing gym",
    "swim school",
    "sports performance center"
  ],
  legal_financial_professional: [
    "law firm",
    "personal injury lawyer",
    "family law attorney",
    "criminal defense lawyer",
    "estate planning attorney",
    "accounting firm",
    "cpa firm",
    "bookkeeping service",
    "tax preparer",
    "insurance agency",
    "financial advisor",
    "mortgage broker",
    "real estate agent",
    "property management company",
    "marketing agency",
    "web design agency",
    "branding agency",
    "managed it services",
    "computer repair shop",
    "printing company",
    "sign shop",
    "photography studio",
    "video production company",
    "staffing agency",
    "travel agency",
    "bankruptcy attorney",
    "immigration attorney",
    "business attorney",
    "elder law attorney",
    "architect",
    "interior designer",
    "engineering firm",
    "surveying company",
    "title company",
    "coworking space",
    "private investigator"
  ],
  auto: [
    "auto repair shop",
    "tire shop",
    "collision repair shop",
    "car detailing service",
    "oil change shop",
    "auto glass shop",
    "transmission shop",
    "used car dealer",
    "car wash",
    "towing company",
    "brake shop",
    "diesel repair shop",
    "motorcycle repair shop",
    "rv repair shop",
    "boat repair service",
    "auto parts store",
    "car audio installer"
  ],
  food_hospitality: [
    "restaurant",
    "coffee shop",
    "bakery",
    "pizza restaurant",
    "mexican restaurant",
    "italian restaurant",
    "sushi restaurant",
    "bbq restaurant",
    "burger restaurant",
    "breakfast restaurant",
    "brewery",
    "cocktail bar",
    "hotel",
    "motel",
    "bed and breakfast",
    "event venue",
    "caterer",
    "food truck",
    "ice cream shop",
    "seafood restaurant",
    "steakhouse",
    "sandwich shop",
    "wine bar",
    "sports bar",
    "tea shop",
    "donut shop",
    "juice bar"
  ],
  retail: [
    "computer store",
    "electronics store",
    "cell phone repair shop",
    "furniture store",
    "mattress store",
    "appliance store",
    "hardware store",
    "jewelry store",
    "florist",
    "bookstore",
    "boutique",
    "thrift store",
    "pet store",
    "grocery store",
    "liquor store",
    "smoke shop",
    "optical shop",
    "bike shop",
    "running store",
    "toy store",
    "party supply store",
    "outdoor gear store",
    "art supply store",
    "flooring store",
    "tile store",
    "kitchen supply store",
    "supplement store"
  ],
  pet_childcare_education: [
    "veterinary clinic",
    "dog groomer",
    "pet boarding",
    "dog daycare",
    "dog trainer",
    "pet sitter",
    "daycare center",
    "childcare center",
    "preschool",
    "montessori school",
    "tutoring center",
    "music school",
    "driving school",
    "after-school program",
    "pet hospital",
    "emergency vet",
    "dog walking service",
    "obedience school",
    "private school",
    "language school",
    "coding academy"
  ],
  senior_care: [
    "assisted living community",
    "senior home care service",
    "memory care community",
    "hospice care service",
    "independent living community",
    "skilled nursing facility"
  ],
  real_estate_home: [
    "real estate agent",
    "real estate brokerage",
    "apartment community",
    "custom home builder",
    "home inspector",
    "mortgage lender"
  ],
  weddings_events: [
    "wedding venue",
    "wedding planner",
    "florist",
    "dj service",
    "party rental company",
    "photo booth rental"
  ],
  specialty_local: [
    "screen printing shop",
    "embroidery shop",
    "dry cleaner",
    "laundromat",
    "tailor",
    "funeral home",
    "storage facility",
    "self storage facility",
    "pawn shop",
    "gun store"
  ]
} as const;

function normalizeSpacing(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toSentenceCase(value: string): string {
  return normalizeSpacing(value).toLowerCase();
}

export const SCOUT_BUSINESS_TYPE_SUGGESTIONS = [
  ...new Set(Object.values(BUSINESS_TYPE_GROUPS).flat())
];

const BUSINESS_TYPE_LOOKUP = new Map(
  SCOUT_BUSINESS_TYPE_SUGGESTIONS.map((businessType) => [businessType.toLowerCase(), businessType])
);

export function normalizeStructuredBusinessTypeInput(rawBusinessType: string): string {
  const cleaned = normalizeSpacing(rawBusinessType);
  if (!cleaned) {
    return "";
  }

  return BUSINESS_TYPE_LOOKUP.get(cleaned.toLowerCase()) ?? toSentenceCase(cleaned);
}

export function buildStructuredScoutQuery(input: {
  businessType: string;
  location: string;
}): string {
  const businessType = normalizeStructuredBusinessTypeInput(input.businessType);
  const location = normalizeStructuredLocationInput(input.location);

  if (!businessType || !location) {
    return "";
  }

  return `${businessType} in ${location}`;
}

export { normalizeStructuredLocationInput, SCOUT_CITY_STATE_SUGGESTIONS };
