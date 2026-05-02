import type {
  LeadInboxItem,
  LeadOutreachSummary,
  LeadStatus,
  OutreachDraft
} from "@scout/domain";

import { createLeadAnnotationRepository } from "../storage/lead-annotation-repository.ts";
import { createOutreachDraftRepository } from "../storage/outreach-draft-repository.ts";

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

function hasDraftContent(draft: OutreachDraft): boolean {
  return Boolean(
    draft.subjectLine.trim() ||
      draft.body.trim() ||
      draft.shortMessage?.trim() ||
      draft.phoneTalkingPoints
  );
}

function resolveOutreachStatus(draft: OutreachDraft | undefined): LeadOutreachSummary["status"] {
  if (!draft) {
    return "no_draft";
  }

  if (!hasDraftContent(draft)) {
    return "contact_analyzed";
  }

  return draft.model ? "draft_ready" : "edited_saved";
}

function resolveRecommendedChannelLabel(draft: OutreachDraft): string | undefined {
  if (!draft.recommendedChannel) {
    return undefined;
  }

  return draft.contactChannels.find((channel) => channel.kind === draft.recommendedChannel)?.label;
}

function resolveNextAction(state: LeadStatus, outreachStatus: LeadOutreachSummary["status"]): string {
  if (state === "contacted") {
    return "Follow up";
  }

  if (state === "dismissed" || state === "not_a_fit") {
    return "Closed";
  }

  if (outreachStatus === "no_draft") {
    return state === "needs_review" ? "Review lead" : "Analyze contact";
  }

  if (outreachStatus === "contact_analyzed") {
    return "Draft outreach";
  }

  return "Contact lead";
}

function buildOutreachSummary(
  state: LeadStatus,
  draft: OutreachDraft | undefined
): LeadOutreachSummary {
  const status = resolveOutreachStatus(draft);

  if (!draft) {
    return {
      status,
      nextAction: resolveNextAction(state, status)
    };
  }

  const recommendedChannelLabel = resolveRecommendedChannelLabel(draft);

  return {
    status,
    nextAction: resolveNextAction(state, status),
    draftId: draft.draftId,
    ...(draft.recommendedChannel ? { recommendedChannel: draft.recommendedChannel } : {}),
    ...(recommendedChannelLabel ? { recommendedChannelLabel } : {}),
    ...(draft.subjectLine.trim() ? { subjectLine: draft.subjectLine } : {}),
    draftUpdatedAt: draft.updatedAt
  };
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
  const drafts = await createOutreachDraftRepository().listByRunIds(
    records.map((record) => record.run.runId)
  );
  const draftByLead = new Map(drafts.map((draft) => [`${draft.runId}:${draft.candidateId}`, draft]));

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
    const draft = draftByLead.get(`${record.run.runId}:${record.annotation.candidateId}`);

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
      outreach: buildOutreachSummary(record.annotation.state, draft),
      annotation: record.annotation
    };
  });
}
