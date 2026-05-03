import {
  evaluatePresenceUrl,
  isAggregatorRoundupResult,
  isCommunityDiscussionResult
} from "../../../../../../packages/domain/src/presence.ts";
import type {
  AcquisitionAttemptOutcome,
  AcquisitionDiagnostics,
  AcquisitionDiscardRecord,
  AcquisitionDuplicateRecord,
  AcquisitionFallbackTrigger,
  AcquisitionSourceCount,
  CandidateProvenanceKind,
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
import type {
  ProviderSearchCandidate,
  ProviderSearchResponse,
  SearchProviderAdapter
} from "./provider-types.ts";
import { buildQueryVariants } from "./query-variants.ts";

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
  provenance: CandidateProvenanceKind;
  provenanceNote?: string;
  extractedFromCandidateId?: string;
}

interface VariantAccumulator {
  label: string;
  query: string;
  rawResultCount: number;
  acceptedResultCount: number;
  sources: Set<string>;
}

function shouldQueryProviderVariant(
  provider: SearchProviderAdapter,
  variantLabel: string
): boolean {
  if (provider.name === "bing_html" || provider.name === "google_html") {
    return (
      variantLabel === "raw" ||
      variantLabel === "official_website" ||
      variantLabel === "contact_path"
    );
  }

  return true;
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
  if (isCommunityDiscussionResult({ url: candidate.canonicalUrl })) {
    return "Community discussion or non-business forum page, not a direct business presence.";
  }

  if (
    (candidate.presenceHint === "directory_only" || candidate.presenceHint === "marketplace") &&
    isAggregatorRoundupResult({
      url: candidate.canonicalUrl,
      title: candidate.title,
      snippet: candidate.snippet
    })
  ) {
    return 'Aggregator, roundup, or "best of" page, not a direct business presence.';
  }

  if (isGenericDirectorySearchPage(candidate)) {
    return "Generic directory or search page, not a business-specific presence.";
  }

  if (candidate.businessKey.length < 2) {
    return "Candidate title was too weak to treat as a business presence.";
  }

  return null;
}

function buildDiscardRecord(
  candidate: RawAcquisitionCandidate,
  reason: string
): AcquisitionDiscardRecord {
  return {
    candidateId: candidate.candidateId,
    reason,
    title: candidate.title,
    url: candidate.canonicalUrl,
    domain: candidate.canonicalHost,
    snippet: candidate.snippet,
    source: candidate.source
  };
}

function buildRawCandidate(
  input: ProviderSearchCandidate,
  index: number,
  acquisitionKind: "live" | "fallback",
  acquisitionQuery: string,
  variantLabel: string,
  provenance: CandidateProvenanceKind = "live_search_result",
  provenanceNote?: string,
  extractedFromCandidateId?: string
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
    }).type,
    provenance,
    ...(provenanceNote ? { provenanceNote } : {}),
    ...(extractedFromCandidateId ? { extractedFromCandidateId } : {})
  };
}

function isDirectorySnippetSource(candidate: RawAcquisitionCandidate): boolean {
  return (
    candidate.presenceHint === "directory_only" ||
    candidate.presenceHint === "marketplace" ||
    candidate.presenceHint === "yelp_only"
  );
}

function cleanupExtractedBusinessName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/\s+(is|are|provides?|offers?|located|serves?|specializes?)\b.*$/i, "")
    .replace(/\s+-\s+.*$/i, "")
    .replace(/\s+\|\s+.*$/i, "")
    .trim();
}

function extractBusinessNamesFromSnippet(candidate: RawAcquisitionCandidate): string[] {
  if (!isDirectorySnippetSource(candidate)) {
    return [];
  }

  const snippets = candidate.snippet
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanupExtractedBusinessName)
    .filter((part) => part.length >= 4 && part.length <= 90);
  const candidates: string[] = [];

  for (const part of snippets) {
    const match = part.match(
      /^([A-Z0-9][A-Za-z0-9&'., ]{2,70}?)(?:\s+(?:is|are|provides?|offers?|located|serves?|specializes?)\b|$)/
    );
    const extracted = cleanupExtractedBusinessName(match?.[1] ?? part);
    if (
      extracted &&
      /[a-z]/i.test(extracted) &&
      !/\b(best|near|reviews?|directions?|results?|search|category|undefined)\b/i.test(extracted) &&
      !titlesLookEquivalent(extracted, candidate.title)
    ) {
      candidates.push(extracted);
    }
  }

  return [...new Set(candidates)].slice(0, 2);
}

function buildDirectorySnippetCandidates(
  sourceCandidate: RawAcquisitionCandidate,
  startIndex: number
): RawAcquisitionCandidate[] {
  return extractBusinessNamesFromSnippet(sourceCandidate).map((businessName, index) =>
    buildRawCandidate(
      {
        title: businessName,
        url: sourceCandidate.canonicalUrl,
        snippet: sourceCandidate.snippet,
        source: `${sourceCandidate.source}_directory_snippet`
      },
      startIndex + index,
      sourceCandidate.acquisitionKind,
      sourceCandidate.acquisitionQuery,
      "directory_snippet",
      "directory_snippet",
      `Extracted from a ${describeProviderSource(sourceCandidate.source)} directory/profile snippet. Verify before treating as an owned web presence.`,
      sourceCandidate.candidateId
    )
  );
}

function describeProviderSource(source: string): string {
  return source.replace(/_/g, " ");
}

function getPreferenceScore(candidate: RawAcquisitionCandidate): number {
  let score = candidate.acquisitionKind === "live" ? 100 : 0;
  score += Math.max(0, 18 - candidate.rawRank);

  if (candidate.provenance === "directory_snippet") {
    score -= 8;
  }

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

  if (candidate.variantLabel === "local_profile" || candidate.variantLabel === "service_area") {
    score += 2;
  }

  return score;
}

function getDuplicateReason(
  left: RawAcquisitionCandidate,
  right: RawAcquisitionCandidate
): string | null {
  if (left.comparisonKey === right.comparisonKey) {
    if (
      (left.provenance === "directory_snippet" || right.provenance === "directory_snippet") &&
      left.businessKey !== right.businessKey
    ) {
      return null;
    }

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

function isProviderDegraded(outcome: AcquisitionAttemptOutcome): boolean {
  return outcome !== "success" && outcome !== "empty";
}

function mapOutcomeToFallbackReason(
  outcome: AcquisitionAttemptOutcome
): AcquisitionFallbackTrigger["reason"] | null {
  if (outcome === "empty") {
    return "provider_empty";
  }

  if (outcome === "blocked") {
    return "provider_blocked";
  }

  if (outcome === "parse_error") {
    return "provider_parse_failure";
  }

  if (outcome === "network_error") {
    return "provider_network_error";
  }

  if (outcome === "http_error") {
    return "provider_http_error";
  }

  return null;
}

function summarizeFallbackTriggers(input: {
  liveAttempts: AcquisitionDiagnostics["providerAttempts"];
  useFallbackOnly: boolean;
  liveCandidateCount: number;
  limits: SearchLimits;
}): AcquisitionFallbackTrigger[] {
  const triggers: AcquisitionFallbackTrigger[] = [];

  if (input.useFallbackOnly) {
    triggers.push({
      reason: "fallback_only_mode",
      detail: "Scout was configured to skip live acquisition for this run."
    });
    return triggers;
  }

  if (input.liveCandidateCount < input.limits.minCandidates) {
    triggers.push({
      reason: "insufficient_live_candidates",
      detail: `Live acquisition kept ${input.liveCandidateCount} candidates before the seeded fallback catalog was used.`
    });
  }

  const seenDegradations = new Set<string>();
  for (const attempt of input.liveAttempts) {
    const reason = mapOutcomeToFallbackReason(attempt.outcome);
    if (!reason) {
      continue;
    }

    const key = `${attempt.provider}:${reason}`;
    if (seenDegradations.has(key)) {
      continue;
    }

    seenDegradations.add(key);
    triggers.push({
      reason,
      provider: attempt.provider,
      ...(attempt.detail ? { detail: attempt.detail } : {})
    });
  }

  return triggers;
}

function determineSampleQuality(input: {
  limits: SearchLimits;
  selected: RawAcquisitionCandidate[];
  fallbackUsed: boolean;
  notes: string[];
  providerAttempts: AcquisitionDiagnostics["providerAttempts"];
}): MarketSampleQuality {
  const selectedCount = input.selected.length;
  const liveCount = input.selected.filter((candidate) => candidate.acquisitionKind === "live").length;
  const fallbackCount = input.selected.filter(
    (candidate) => candidate.acquisitionKind === "fallback"
  ).length;
  const lowSignalRatio =
    selectedCount > 0
      ? input.selected.filter((candidate) => isLowSignalPresence(candidate.presenceHint)).length /
        selectedCount
      : 1;
  const fallbackRatio = selectedCount > 0 ? fallbackCount / selectedCount : 0;
  const providerDegraded = input.providerAttempts.some(
    (attempt) => attempt.kind === "live" && isProviderDegraded(attempt.outcome)
  );
  const successfulLiveProviderCount = new Set(
    input.providerAttempts
      .filter((attempt) => attempt.kind === "live" && attempt.outcome === "success")
      .map((attempt) => attempt.provider)
  ).size;
  const degradationShouldLimitConfidence =
    providerDegraded &&
    (successfulLiveProviderCount === 0 ||
      selectedCount < input.limits.minCandidates + 2 ||
      lowSignalRatio > 0.35);

  if (
    selectedCount < Math.ceil(input.limits.minCandidates / 2) ||
    (liveCount === 0 && input.fallbackUsed) ||
    fallbackRatio >= 0.7 ||
    lowSignalRatio >= 0.7
  ) {
    return "weak_sample";
  }

  if (
    selectedCount < input.limits.minCandidates ||
    liveCount / Math.max(selectedCount, 1) < 0.5 ||
    fallbackRatio >= 0.4 ||
    lowSignalRatio >= 0.5 ||
    degradationShouldLimitConfidence
  ) {
    return "partial_sample";
  }

  if (
    selectedCount >= Math.min(input.limits.maxCandidates, input.limits.minCandidates + 2) &&
    liveCount / selectedCount >= 0.75 &&
    fallbackCount === 0 &&
    !providerDegraded &&
    lowSignalRatio <= 0.35 &&
    input.notes.length <= 1
  ) {
    return "strong_sample";
  }

  return "adequate_sample";
}

function buildCandidateSourceBreakdown(
  rawCandidates: RawAcquisitionCandidate[],
  selected: RawAcquisitionCandidate[]
): AcquisitionSourceCount[] {
  const sourceCounts = new Map<string, AcquisitionSourceCount>();

  const ensureSource = (candidate: RawAcquisitionCandidate): AcquisitionSourceCount => {
    const existing = sourceCounts.get(candidate.source);
    if (existing) {
      return existing;
    }

    const created: AcquisitionSourceCount = {
      source: candidate.source,
      kind: candidate.acquisitionKind,
      rawCandidateCount: 0,
      selectedCandidateCount: 0
    };
    sourceCounts.set(candidate.source, created);
    return created;
  };

  for (const candidate of rawCandidates) {
    ensureSource(candidate).rawCandidateCount += 1;
  }

  for (const candidate of selected) {
    ensureSource(candidate).selectedCandidateCount += 1;
  }

  return [...sourceCounts.values()].sort(
    (left, right) =>
      Number(left.kind === "fallback") - Number(right.kind === "fallback") ||
      right.selectedCandidateCount - left.selectedCandidateCount ||
      right.rawCandidateCount - left.rawCandidateCount ||
      left.source.localeCompare(right.source)
  );
}

function buildDiagnosticsNotes(input: {
  intent: ResolvedMarketIntent;
  limits: SearchLimits;
  selected: RawAcquisitionCandidate[];
  rawCandidateCount: number;
  fallbackUsed: boolean;
  mergedCount: number;
  discardedCount: number;
  providerAttempts: AcquisitionDiagnostics["providerAttempts"];
  fallbackTriggers: AcquisitionFallbackTrigger[];
}): string[] {
  const notes: string[] = [];
  const liveCount = input.selected.filter((candidate) => candidate.acquisitionKind === "live").length;
  const fallbackCount = input.selected.filter(
    (candidate) => candidate.acquisitionKind === "fallback"
  ).length;
  const lowSignalCount = input.selected.filter((candidate) =>
    isLowSignalPresence(candidate.presenceHint)
  ).length;
  const directorySnippetCount = input.selected.filter(
    (candidate) => candidate.provenance === "directory_snippet"
  ).length;

  if (!input.intent.locationLabel) {
    notes.push(
      "No explicit location was resolved from the query, so the market slice may be broader than intended."
    );
  }

  if (input.intent.categories.includes("general_local_business")) {
    notes.push(
      "Scout could not resolve a strong vertical from the query and used a generic local-business interpretation."
    );
  }

  if (input.fallbackTriggers.some((trigger) => trigger.reason === "fallback_only_mode")) {
    notes.push("Scout was configured to use only the seeded fallback catalog for this run.");
  }

  if (input.providerAttempts.some((attempt) => attempt.kind === "live" && attempt.outcome === "blocked")) {
    notes.push("The live provider showed signs of blocking or degraded access during acquisition.");
  }

  if (
    input.providerAttempts.some((attempt) =>
      attempt.detail?.includes("manual human confirmation")
    )
  ) {
    notes.push("At least one live provider required in-browser human confirmation before Scout could keep results.");
  }

  if (
    input.providerAttempts.some((attempt) =>
      attempt.detail?.includes("not completed before timeout")
    )
  ) {
    notes.push("Scout opened a browser confirmation window for a blocked live provider, but the challenge was not completed in time.");
  }

  if (
    input.providerAttempts.some((attempt) => attempt.kind === "live" && attempt.outcome === "parse_error")
  ) {
    notes.push("Scout received at least one live provider page it could not parse cleanly.");
  }

  if (
    input.providerAttempts.some((attempt) =>
      attempt.kind === "live" &&
      (attempt.outcome === "network_error" || attempt.outcome === "http_error")
    )
  ) {
    notes.push("At least one live provider attempt failed before Scout could gather a stable result set.");
  }

  if (
    input.providerAttempts.some((attempt) => attempt.kind === "live" && attempt.outcome === "empty")
  ) {
    notes.push("At least one live provider attempt returned no results for its query variant.");
  }

  if (input.fallbackUsed && liveCount === 0) {
    notes.push("No usable live results survived acquisition. Interpret this run as fallback-driven.");
  } else if (input.fallbackUsed && fallbackCount > 0) {
    notes.push("Fallback candidates were used to fill gaps after live acquisition and consolidation.");
  }

  if (fallbackCount > 0 && fallbackCount >= Math.max(1, liveCount)) {
    notes.push(
      "Seeded fallback contributed as much or more of the kept sample as live acquisition, so treat the market picture cautiously."
    );
  }

  if (input.selected.length < input.limits.minCandidates) {
    notes.push("The final market sample landed below the minimum target candidate count.");
  }

  if (input.rawCandidateCount > 0 && input.discardedCount / input.rawCandidateCount >= 0.35) {
    notes.push(
      "A meaningful share of gathered results were discarded as low-value or non-specific search pages."
    );
  }

  if (input.selected.length > 0 && lowSignalCount / input.selected.length >= 0.5) {
    notes.push("The final sample still leans heavily on directory, marketplace, or profile-style presences.");
  }

  if (directorySnippetCount > 0) {
    notes.push(
      `${directorySnippetCount} kept candidate(s) were extracted from directory/profile snippets and should be treated as lower-confidence until Scout finds a direct owned presence.`
    );
  }

  if (input.mergedCount >= Math.max(3, Math.floor(input.rawCandidateCount * 0.2))) {
    notes.push("Multiple overlapping candidates were merged across query variants before final selection.");
  }

  return [...new Set(notes)];
}

function toSearchCandidate(candidate: RawAcquisitionCandidate, rank: number): SearchCandidate {
  return {
    candidateId: candidate.candidateId,
    rank,
    title: candidate.title,
    url: candidate.canonicalUrl,
    domain: candidate.canonicalHost,
    snippet: candidate.snippet,
    source: candidate.source,
    provenance: candidate.provenance,
    ...(candidate.provenanceNote ? { provenanceNote: candidate.provenanceNote } : {}),
    ...(candidate.extractedFromCandidateId
      ? { extractedFromCandidateId: candidate.extractedFromCandidateId }
      : {})
  };
}

function ensureVariantAccumulator(
  variantStats: Map<string, VariantAccumulator>,
  label: string,
  query: string
): VariantAccumulator {
  const existing = variantStats.get(label);
  if (existing) {
    return existing;
  }

  const created: VariantAccumulator = {
    label,
    query,
    rawResultCount: 0,
    acceptedResultCount: 0,
    sources: new Set()
  };
  variantStats.set(label, created);
  return created;
}

function recordProviderAttempt(input: {
  attempts: AcquisitionDiagnostics["providerAttempts"];
  provider: SearchProviderAdapter;
  variantLabel: string;
  query: string;
  response: ProviderSearchResponse;
}): void {
  input.attempts.push({
    provider: input.provider.name,
    kind: input.provider.kind,
    variantLabel: input.variantLabel,
    query: input.query,
    outcome: input.response.outcome,
    rawResultCount: input.response.candidates.length,
    ...(input.response.httpStatus ? { httpStatus: input.response.httpStatus } : {}),
    ...(input.response.detail ? { detail: input.response.detail } : {})
  });
}

export async function acquireCandidates(input: {
  intent: ResolvedMarketIntent;
  liveProviders: SearchProviderAdapter[];
  limits: SearchLimits;
  useFallbackOnly?: boolean;
  fallbackProvider?: SearchProviderAdapter;
  onProgress?: (workerNote: string) => Promise<void> | void;
}): Promise<ScoutAcquisitionResult> {
  const queryVariants = buildQueryVariants(input.intent);
  const variantStats = new Map<string, VariantAccumulator>(
    queryVariants.map((variant) => [
      variant.label,
      {
        label: variant.label,
        query: variant.query,
        rawResultCount: 0,
        acceptedResultCount: 0,
        sources: new Set<string>()
      }
    ])
  );
  const rawCandidates: RawAcquisitionCandidate[] = [];
  const discardedCandidates: AcquisitionDiscardRecord[] = [];
  const mergedDuplicates: AcquisitionDuplicateRecord[] = [];
  const providerAttempts: AcquisitionDiagnostics["providerAttempts"] = [];
  let rawSequence = 0;

  if (!input.useFallbackOnly) {
    for (const variant of queryVariants) {
      const variantStat = ensureVariantAccumulator(variantStats, variant.label, variant.query);

      for (const provider of input.liveProviders) {
        if (!shouldQueryProviderVariant(provider, variant.label)) {
          continue;
        }

        await input.onProgress?.(
          `Querying ${provider.name} for the ${variant.label.replace(/_/g, " ")} search variant.`
        );
        const response = await provider.executeQuery(
          variant.query,
          input.limits.maxCandidates,
          input.onProgress
        );
        recordProviderAttempt({
          attempts: providerAttempts,
          provider,
          variantLabel: variant.label,
          query: variant.query,
          response
        });

        variantStat.sources.add(provider.name);
        variantStat.rawResultCount += response.candidates.length;

        if (response.outcome !== "success") {
          continue;
        }

        for (const [index, result] of response.candidates.entries()) {
          rawCandidates.push(
            buildRawCandidate(result, rawSequence + index, provider.kind, variant.query, variant.label)
          );
        }

        rawSequence += response.candidates.length;
      }
    }
  }

  const snippetStat = ensureVariantAccumulator(
    variantStats,
    "directory_snippet",
    "extracted from directory/profile snippets"
  );
  const directorySnippetCandidates: RawAcquisitionCandidate[] = [];

  for (const candidate of rawCandidates) {
    const extracted = buildDirectorySnippetCandidates(
      candidate,
      rawSequence + directorySnippetCandidates.length
    );
    if (extracted.length === 0) {
      continue;
    }

    snippetStat.sources.add(`${candidate.source}_directory_snippet`);
    directorySnippetCandidates.push(...extracted);
  }

  if (directorySnippetCandidates.length > 0) {
    rawCandidates.push(...directorySnippetCandidates);
    snippetStat.rawResultCount += directorySnippetCandidates.length;
    rawSequence += directorySnippetCandidates.length;
  }

  const uniqueCandidates: RawAcquisitionCandidate[] = [];

  for (const candidate of rawCandidates) {
    const discardReason = getDiscardReason(candidate);
    if (discardReason) {
      discardedCandidates.push(buildDiscardRecord(candidate, discardReason));
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

  let fallbackUsed = Boolean(input.useFallbackOnly && input.fallbackProvider);

  if (
    input.fallbackProvider &&
    (uniqueCandidates.length < input.limits.minCandidates || input.useFallbackOnly)
  ) {
    const fallbackVariantLabel = "fallback_catalog";
    const fallbackQuery = input.intent.searchQuery;
    const fallbackStat = ensureVariantAccumulator(
      variantStats,
      fallbackVariantLabel,
      fallbackQuery
    );
    const fallbackResponse = await input.fallbackProvider.executeQuery(
      fallbackQuery,
      input.limits.maxCandidates,
      input.onProgress
    );

    recordProviderAttempt({
      attempts: providerAttempts,
      provider: input.fallbackProvider,
      variantLabel: fallbackVariantLabel,
      query: fallbackQuery,
      response: fallbackResponse
    });

    fallbackUsed = true;
    fallbackStat.sources.add(input.fallbackProvider.name);
    fallbackStat.rawResultCount += fallbackResponse.candidates.length;

    for (const [index, result] of fallbackResponse.candidates.entries()) {
      const candidate = buildRawCandidate(
        result,
        rawSequence + index,
        input.fallbackProvider.kind,
        fallbackQuery,
        fallbackVariantLabel
      );
      rawCandidates.push(candidate);
      const discardReason = getDiscardReason(candidate);
      if (discardReason) {
        discardedCandidates.push(buildDiscardRecord(candidate, discardReason));
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

    rawSequence += fallbackResponse.candidates.length;
  }

  const rankedCandidates = [...uniqueCandidates].sort(
    (left, right) =>
      getPreferenceScore(right) - getPreferenceScore(left) || left.title.localeCompare(right.title)
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

  const fallbackTriggers = summarizeFallbackTriggers({
    liveAttempts: providerAttempts.filter((attempt) => attempt.kind === "live"),
    useFallbackOnly: Boolean(input.useFallbackOnly),
    liveCandidateCount: uniqueCandidates.filter((candidate) => candidate.acquisitionKind === "live").length,
    limits: input.limits
  });
  const diagnosticsNotes = buildDiagnosticsNotes({
    intent: input.intent,
    limits: input.limits,
    selected,
    rawCandidateCount: rawSequence,
    fallbackUsed,
    mergedCount: mergedDuplicates.length,
    discardedCount: discardedCandidates.length,
    providerAttempts,
    fallbackTriggers
  });
  const diagnostics: AcquisitionDiagnostics = {
    provider: input.liveProviders[0]?.name ?? input.fallbackProvider?.name ?? "unresolved",
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
      notes: diagnosticsNotes,
      providerAttempts
    }),
    queryVariants: [...variantStats.values()].map((variant) => ({
      label: variant.label,
      query: variant.query,
      source:
        variant.sources.size > 1
          ? [...variant.sources].sort().join(" + ")
          : [...variant.sources][0] ?? "unresolved",
      rawResultCount: variant.rawResultCount,
      acceptedResultCount: variant.acceptedResultCount
    })),
    providerAttempts,
    candidateSources: buildCandidateSourceBreakdown(rawCandidates, selected),
    fallbackTriggers,
    mergedDuplicates,
    discardedCandidates,
    notes: diagnosticsNotes
  };

  return {
    candidates: selected.map((candidate, index) => toSearchCandidate(candidate, index + 1)),
    diagnostics
  };
}
