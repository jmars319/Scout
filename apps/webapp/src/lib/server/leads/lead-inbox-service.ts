import type { LeadInboxItem, LeadStatus } from "@scout/domain";

import { createLeadAnnotationRepository } from "../storage/lead-annotation-repository.ts";

export type LeadInboxFilter = "all" | "open" | "saved" | "contacted" | "closed" | "due";

export interface LeadInboxFilters {
  filter?: LeadInboxFilter | undefined;
  search?: string | undefined;
  today?: string | undefined;
}

function normalizeSearch(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isClosed(state: LeadStatus): boolean {
  return state === "dismissed" || state === "not_a_fit";
}

function isDue(item: LeadInboxItem, today: string): boolean {
  return Boolean(
    item.annotation.followUpDate &&
      item.annotation.followUpDate <= today &&
      !isClosed(item.annotation.state)
  );
}

function matchesFilter(item: LeadInboxItem, filter: LeadInboxFilter, today: string): boolean {
  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return item.annotation.state === "needs_review";
  }

  if (filter === "closed") {
    return isClosed(item.annotation.state);
  }

  if (filter === "due") {
    return isDue(item, today);
  }

  return item.annotation.state === filter;
}

function matchesSearch(item: LeadInboxItem, search: string): boolean {
  if (!search) {
    return true;
  }

  const haystack = [
    item.businessName,
    item.primaryUrl,
    item.rawQuery,
    item.marketTerm,
    item.locationLabel ?? "",
    item.annotation.operatorNote,
    ...item.reasons
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function resolveToday(value: string | undefined): string {
  return value ?? new Date().toISOString().slice(0, 10);
}

export function normalizeLeadInboxFilter(value: string | null | undefined): LeadInboxFilter {
  if (
    value === "open" ||
    value === "saved" ||
    value === "contacted" ||
    value === "closed" ||
    value === "due"
  ) {
    return value;
  }

  return "all";
}

export function filterLeadInboxItems(
  items: LeadInboxItem[],
  filters: LeadInboxFilters = {}
): LeadInboxItem[] {
  const filter = filters.filter ?? "all";
  const search = normalizeSearch(filters.search);
  const today = resolveToday(filters.today);

  return items.filter((item) => matchesFilter(item, filter, today) && matchesSearch(item, search));
}

export async function listLeadInboxItems(limit = 200): Promise<LeadInboxItem[]> {
  const repository = createLeadAnnotationRepository();
  const records = await repository.listWithRunContext(limit);

  return records.map((record) => {
    const business = record.run.businessBreakdowns.find(
      (breakdown) => breakdown.candidateId === record.annotation.candidateId
    );
    const candidate = record.run.selectedCandidates.find(
      (selectedCandidate) => selectedCandidate.candidateId === record.annotation.candidateId
    );
    const shortlistIndex = record.run.shortlist.findIndex(
      (lead) => lead.candidateId === record.annotation.candidateId
    );
    const shortlist = shortlistIndex >= 0 ? record.run.shortlist[shortlistIndex] : undefined;
    const presenceType = business?.presenceType ?? shortlist?.presenceType;
    const presenceQuality = business?.presenceQuality ?? shortlist?.presenceQuality;
    const confidence = business?.confidence ?? shortlist?.confidence;

    return {
      runId: record.run.runId,
      runCreatedAt: record.run.createdAt,
      runUpdatedAt: record.run.updatedAt,
      rawQuery: record.run.rawQuery,
      marketTerm: record.run.marketTerm,
      ...(record.run.locationLabel ? { locationLabel: record.run.locationLabel } : {}),
      ...(record.run.sampleQuality ? { sampleQuality: record.run.sampleQuality } : {}),
      candidateId: record.annotation.candidateId,
      businessName:
        business?.businessName ??
        shortlist?.businessName ??
        candidate?.title ??
        record.annotation.candidateId,
      primaryUrl: business?.primaryUrl ?? shortlist?.primaryUrl ?? candidate?.url ?? "",
      ...(shortlistIndex >= 0 ? { shortlistRank: shortlistIndex + 1 } : {}),
      ...(shortlist ? { priorityScore: shortlist.priorityScore } : {}),
      ...(presenceType ? { presenceType } : {}),
      ...(presenceQuality ? { presenceQuality } : {}),
      ...(confidence ? { confidence } : {}),
      opportunityTypes: business?.opportunityTypes ?? shortlist?.opportunityTypes ?? [],
      findingCount: business?.findingCount ?? 0,
      highSeverityFindings: business?.highSeverityFindings ?? 0,
      topIssues: business?.topIssues ?? [],
      reasons: shortlist?.reasons ?? [],
      annotation: record.annotation
    };
  });
}
