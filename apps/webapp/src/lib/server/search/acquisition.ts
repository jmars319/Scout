import {
  evaluatePresenceUrl,
} from "../../../../../../packages/domain/src/presence.ts";
import type {
  AcquisitionDiagnostics,
  AcquisitionDiscardRecord,
  AcquisitionDuplicateRecord,
  MarketSampleQuality,
  ResolvedMarketIntent,
  ScoutAcquisitionResult,
  SearchCandidate
} from "../../../../../../packages/domain/src/model.ts";

import {
  buildBusinessKey,
  canonicalizeUrl,
  titlesLookEquivalent
} from "./canonicalize.ts";
import type { ProviderSearchCandidate } from "./provider-types.ts";
import { buildQueryVariants } from "./query-variants.ts";

interface SearchClient {
  name: string;
  search: (query: string, limit: number) => Promise<ProviderSearchCandidate[]>;
}

interface SearchLimits {
  minCandidates: number;
  maxCandidates: number;
}

interface RawAcquisitionCandidate extends ProviderSearchCandidate {
  candidateId: string;
  rawRank: number;
  acquisitionKind: "live" | "fallback";
  variantLabel: string;
  acquisitionQuery: string;
  canonicalUrl: string;
  canonicalHost: string;
  comparisonKey: string;
  businessKey: string;
  presenceHint: ReturnType<typeof evaluatePresenceUrl>["type"];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function isLowSignalPresence(presenceType: RawAcquisitionCandidate["presenceHint"]): boolean {
  return (
    presenceType === "directory_only" ||
    presenceType === "facebook_only" ||
    presenceType === "yelp_only" ||
    presenceType === "marketplace" ||
    presenceType === "unknown"
  );
}

function isGenericDirectorySearchPage(candidate: RawAcquisitionCandidate): boolean {
  const url = new URL(candidate.canonicalUrl);
  const path = url.pathname.toLowerCase();

  if (candidate.presenceHint !== "directory_only" && candidate.presenceHint !== "yelp_only") {
    return false;
  }

  return (
    path === "/" ||
    path === "/search" ||
    path.startsWith("/search/") ||
    path.startsWith("/results") ||
    url.searchParams.has("search_terms") ||
    url.searchParams.has("find_desc")
  );
}

function getDiscardReason(candidate: RawAcquisitionCandidate): string | null {
  if (isGenericDirectorySearchPage(candidate)) {
    return "Generic directory or search page, not a business-specific presence.";
  }

  if (candidate.businessKey.length < 2) {
    return "Candidate title was too weak to treat as a business presence.";
  }

  return null;
}

function buildRawCandidate(
  input: ProviderSearchCandidate,
  index: number,
  acquisitionKind: "live" | "fallback",
  acquisitionQuery: string,
  variantLabel: string
): RawAcquisitionCandidate {
  const canonical = canonicalizeUrl(input.url);
  const businessKey = buildBusinessKey(input.title) || canonical.canonicalHost;

  return {
    ...input,
    candidateId: `${acquisitionKind}-${index + 1}-${slugify(`${businessKey}-${canonical.canonicalHost}`) || "candidate"}`,
    rawRank: index + 1,
    acquisitionKind,
    variantLabel,
    acquisitionQuery,
    canonicalUrl: canonical.canonicalUrl,
    canonicalHost: canonical.canonicalHost,
    comparisonKey: canonical.comparisonKey,
    businessKey,
    presenceHint: evaluatePresenceUrl({
      url: canonical.canonicalUrl,
      title: input.title,
      snippet: input.snippet
    }).type
  };
}

function getPreferenceScore(candidate: RawAcquisitionCandidate): number {
  let score = candidate.acquisitionKind === "live" ? 100 : 0;
  score += Math.max(0, 18 - candidate.rawRank);

  if (candidate.presenceHint === "owned_website") {
    score += 30;
  } else if (candidate.presenceHint === "dead" || candidate.presenceHint === "blocked") {
    score += 24;
  } else if (candidate.presenceHint === "marketplace") {
    score += 12;
  } else if (candidate.presenceHint === "facebook_only" || candidate.presenceHint === "yelp_only") {
    score += 10;
  } else if (candidate.presenceHint === "directory_only") {
    score += 8;
  } else {
    score += 6;
  }

  if (candidate.variantLabel === "normalized") {
    score += 4;
  }

  if (candidate.variantLabel === "raw") {
    score += 2;
  }

  return score;
}

function getDuplicateReason(
  left: RawAcquisitionCandidate,
  right: RawAcquisitionCandidate
): string | null {
  if (left.comparisonKey === right.comparisonKey) {
    return "Same canonical URL after normalization.";
  }

  if (
    left.canonicalHost === right.canonicalHost &&
    left.presenceHint === right.presenceHint &&
    titlesLookEquivalent(left.title, right.title)
  ) {
    return "Same host and business title across query variants.";
  }

  if (
    left.canonicalHost === right.canonicalHost &&
    left.presenceHint === "owned_website" &&
    right.presenceHint === "owned_website" &&
    titlesLookEquivalent(left.title, right.title)
  ) {
    return "Owned website duplicate across query variants.";
  }

  return null;
}

function shouldDeferLowSignalCandidate(
  candidate: RawAcquisitionCandidate,
  selected: RawAcquisitionCandidate[],
  remaining: RawAcquisitionCandidate[],
  limits: SearchLimits
): boolean {
  if (!isLowSignalPresence(candidate.presenceHint)) {
    return false;
  }

  const lowSignalCap = Math.max(3, Math.floor(limits.maxCandidates * 0.35));
  const selectedLowSignalCount = selected.filter((entry) =>
    isLowSignalPresence(entry.presenceHint)
  ).length;
  const remainingHigherValue = remaining.some((entry) => !isLowSignalPresence(entry.presenceHint));

  return selectedLowSignalCount >= lowSignalCap && remainingHigherValue;
}

function determineSampleQuality(input: {
  limits: SearchLimits;
  selected: RawAcquisitionCandidate[];
  fallbackUsed: boolean;
  notes: string[];
}): MarketSampleQuality {
  const selectedCount = input.selected.length;
  const liveCount = input.selected.filter((candidate) => candidate.acquisitionKind === "live").length;
  const lowSignalRatio =
    selectedCount > 0
      ? input.selected.filter((candidate) => isLowSignalPresence(candidate.presenceHint)).length /
        selectedCount
      : 1;

  if (
    selectedCount < Math.ceil(input.limits.minCandidates / 2) ||
    (liveCount === 0 && input.fallbackUsed) ||
    lowSignalRatio >= 0.7
  ) {
    return "weak_sample";
  }

  if (
    selectedCount < input.limits.minCandidates ||
    liveCount / Math.max(selectedCount, 1) < 0.5 ||
    lowSignalRatio >= 0.5
  ) {
    return "partial_sample";
  }

  if (
    selectedCount >= Math.min(input.limits.maxCandidates, input.limits.minCandidates + 2) &&
    liveCount / selectedCount >= 0.75 &&
    lowSignalRatio <= 0.35 &&
    input.notes.length <= 1
  ) {
    return "strong_sample";
  }

  return "adequate_sample";
}

function buildDiagnosticsNotes(input: {
  intent: ResolvedMarketIntent;
  limits: SearchLimits;
  selected: RawAcquisitionCandidate[];
  rawCandidateCount: number;
  fallbackUsed: boolean;
  mergedCount: number;
  discardedCount: number;
  providerIssues: string[];
}): string[] {
  const notes = [...input.providerIssues];
  const liveCount = input.selected.filter((candidate) => candidate.acquisitionKind === "live").length;
  const fallbackCount = input.selected.filter(
    (candidate) => candidate.acquisitionKind === "fallback"
  ).length;
  const lowSignalCount = input.selected.filter((candidate) =>
    isLowSignalPresence(candidate.presenceHint)
  ).length;

  if (!input.intent.locationLabel) {
    notes.push("No explicit location was resolved from the query, so the market slice may be broader than intended.");
  }

  if (input.intent.categories.includes("general_local_business")) {
    notes.push("Scout could not resolve a strong vertical from the query and used a generic local-business interpretation.");
  }

  if (input.fallbackUsed && liveCount === 0) {
    notes.push("No usable live results survived acquisition. Interpret this run as fallback-driven.");
  } else if (input.fallbackUsed && fallbackCount > 0) {
    notes.push("Fallback candidates were used to fill gaps after live acquisition and consolidation.");
  }

  if (input.selected.length < input.limits.minCandidates) {
    notes.push("The final market sample landed below the minimum target candidate count.");
  }

  if (input.rawCandidateCount > 0 && input.discardedCount / input.rawCandidateCount >= 0.35) {
    notes.push("A meaningful share of gathered results were discarded as low-value or non-specific search pages.");
  }

  if (input.selected.length > 0 && lowSignalCount / input.selected.length >= 0.5) {
    notes.push("The final sample still leans heavily on directory, marketplace, or profile-style presences.");
  }

  if (input.mergedCount >= Math.max(3, Math.floor(input.rawCandidateCount * 0.2))) {
    notes.push("Multiple overlapping candidates were merged across query variants before final selection.");
  }

  return notes;
}

function toSearchCandidate(candidate: RawAcquisitionCandidate, rank: number): SearchCandidate {
  return {
    candidateId: candidate.candidateId,
    rank,
    title: candidate.title,
    url: candidate.canonicalUrl,
    domain: candidate.canonicalHost,
    snippet: candidate.snippet,
    source: candidate.source
  };
}

export async function acquireCandidates(input: {
  intent: ResolvedMarketIntent;
  provider: SearchClient;
  limits: SearchLimits;
  useFallbackOnly?: boolean;
  fallbackSearch: (intent: ResolvedMarketIntent, limit: number) => Promise<ProviderSearchCandidate[]>;
}): Promise<ScoutAcquisitionResult> {
  const queryVariants = buildQueryVariants(input.intent);
  const variantStats = new Map(
    queryVariants.map((variant) => [
      variant.label,
      {
        label: variant.label,
        query: variant.query,
        source: input.provider.name,
        rawResultCount: 0,
        acceptedResultCount: 0
      }
    ])
  );
  const rawCandidates: RawAcquisitionCandidate[] = [];
  const discardedCandidates: AcquisitionDiscardRecord[] = [];
  const mergedDuplicates: AcquisitionDuplicateRecord[] = [];
  const providerIssues: string[] = [];
  let rawSequence = 0;

  if (!input.useFallbackOnly) {
    for (const variant of queryVariants) {
      try {
        const results = await input.provider.search(variant.query, input.limits.maxCandidates);
        const variantStat = variantStats.get(variant.label);
        if (variantStat) {
          variantStat.rawResultCount += results.length;
        }

        for (const [index, result] of results.entries()) {
          rawCandidates.push(
            buildRawCandidate(result, rawSequence + index, "live", variant.query, variant.label)
          );
        }

        rawSequence += results.length;
      } catch (error) {
        providerIssues.push(
          `${input.provider.name} failed for "${variant.query}": ${
            error instanceof Error ? error.message : "Unknown provider error."
          }`
        );
      }
    }
  }

  const uniqueCandidates: RawAcquisitionCandidate[] = [];

  for (const candidate of rawCandidates) {
    const discardReason = getDiscardReason(candidate);
    if (discardReason) {
      discardedCandidates.push({
        candidateId: candidate.candidateId,
        reason: discardReason
      });
      continue;
    }

    const duplicateIndex = uniqueCandidates.findIndex((existing) =>
      Boolean(getDuplicateReason(existing, candidate))
    );

    if (duplicateIndex >= 0) {
      const existing = uniqueCandidates[duplicateIndex]!;
      const reason = getDuplicateReason(existing, candidate) ?? "Duplicate candidate.";
      const preferred = getPreferenceScore(candidate) > getPreferenceScore(existing) ? candidate : existing;
      const duplicate = preferred === candidate ? existing : candidate;

      uniqueCandidates[duplicateIndex] = preferred;
      mergedDuplicates.push({
        keptCandidateId: preferred.candidateId,
        duplicateCandidateId: duplicate.candidateId,
        reason
      });
      continue;
    }

    uniqueCandidates.push(candidate);
  }

  let fallbackUsed = Boolean(input.useFallbackOnly);

  if (uniqueCandidates.length < input.limits.minCandidates) {
    const fallbackResults = await input.fallbackSearch(input.intent, input.limits.maxCandidates);
    fallbackUsed = true;

    const fallbackStatKey = "fallback_catalog";
    const existingFallbackStat = variantStats.get(fallbackStatKey);
    if (!existingFallbackStat) {
      variantStats.set(fallbackStatKey, {
        label: fallbackStatKey,
        query: input.intent.searchQuery,
        source: "seeded_stub",
        rawResultCount: fallbackResults.length,
        acceptedResultCount: 0
      });
    }

    for (const [index, result] of fallbackResults.entries()) {
      const candidate = buildRawCandidate(
        result,
        rawSequence + index,
        "fallback",
        input.intent.searchQuery,
        fallbackStatKey
      );
      const discardReason = getDiscardReason(candidate);
      if (discardReason) {
        discardedCandidates.push({
          candidateId: candidate.candidateId,
          reason: discardReason
        });
        continue;
      }

      const duplicateIndex = uniqueCandidates.findIndex((existing) =>
        Boolean(getDuplicateReason(existing, candidate))
      );

      if (duplicateIndex >= 0) {
        const existing = uniqueCandidates[duplicateIndex]!;
        const reason = getDuplicateReason(existing, candidate) ?? "Duplicate candidate.";
        const preferred = getPreferenceScore(candidate) > getPreferenceScore(existing) ? candidate : existing;
        const duplicate = preferred === candidate ? existing : candidate;

        uniqueCandidates[duplicateIndex] = preferred;
        mergedDuplicates.push({
          keptCandidateId: preferred.candidateId,
          duplicateCandidateId: duplicate.candidateId,
          reason
        });
        continue;
      }

      uniqueCandidates.push(candidate);
    }

    rawSequence += fallbackResults.length;
  }

  const rankedCandidates = [...uniqueCandidates].sort(
    (left, right) => getPreferenceScore(right) - getPreferenceScore(left) || left.title.localeCompare(right.title)
  );
  const selected: RawAcquisitionCandidate[] = [];
  const deferred: RawAcquisitionCandidate[] = [];

  for (const [index, candidate] of rankedCandidates.entries()) {
    const remaining = rankedCandidates.slice(index + 1);

    if (shouldDeferLowSignalCandidate(candidate, selected, remaining, input.limits)) {
      deferred.push(candidate);
      continue;
    }

    selected.push(candidate);
    if (selected.length >= input.limits.maxCandidates) {
      break;
    }
  }

  for (const candidate of deferred) {
    if (selected.length >= input.limits.maxCandidates) {
      break;
    }

    selected.push(candidate);
  }

  for (const candidate of uniqueCandidates) {
    const stat = variantStats.get(candidate.variantLabel);
    if (stat) {
      stat.acceptedResultCount += 1;
    }
  }

  const diagnosticsNotes = buildDiagnosticsNotes({
    intent: input.intent,
    limits: input.limits,
    selected,
    rawCandidateCount: rawSequence,
    fallbackUsed,
    mergedCount: mergedDuplicates.length,
    discardedCount: discardedCandidates.length,
    providerIssues
  });
  const diagnostics: AcquisitionDiagnostics = {
    provider: input.provider.name,
    fallbackUsed,
    rawCandidateCount: rawSequence,
    selectedCandidateCount: selected.length,
    liveCandidateCount: selected.filter((candidate) => candidate.acquisitionKind === "live").length,
    fallbackCandidateCount: selected.filter((candidate) => candidate.acquisitionKind === "fallback").length,
    mergedDuplicateCount: mergedDuplicates.length,
    discardedCandidateCount: discardedCandidates.length,
    sampleQuality: determineSampleQuality({
      limits: input.limits,
      selected,
      fallbackUsed,
      notes: diagnosticsNotes
    }),
    queryVariants: [...variantStats.values()],
    mergedDuplicates,
    discardedCandidates,
    notes: diagnosticsNotes
  };

  return {
    candidates: selected.map((candidate, index) => toSearchCandidate(candidate, index + 1)),
    diagnostics
  };
}
