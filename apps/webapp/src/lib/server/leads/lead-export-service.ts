import type {
  BusinessBreakdown,
  LeadAnnotation,
  LeadInboxItem,
  LeadOutreachSummary,
  LeadOpportunity,
  LeadStatus,
  OutreachDraft,
  ScoutRunReport
} from "@scout/domain";

import { getScoutRun } from "../scout-runner.ts";
import { createOutreachDraftRepository } from "../storage/outreach-draft-repository.ts";
import {
  filterLeadInboxItems,
  listLeadInboxItems,
  type LeadInboxFilters
} from "./lead-inbox-service.ts";
import { getLeadAnnotations } from "./lead-workflow-service.ts";

export type LeadExportFormat = "csv" | "markdown";

interface LeadExportRow {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  state: LeadStatus;
  operatorNote: string;
  followUpDate: string;
  shortlistRank: string;
  priorityScore: string;
  presenceType: string;
  presenceQuality: string;
  confidence: string;
  findingCount: number;
  highSeverityFindings: number;
  topIssues: string[];
  reasons: string[];
  outreach: LeadOutreachSummary;
}

interface LeadExportResult {
  body: string;
  contentType: string;
  filename: string;
}

const DEFAULT_STATE: LeadStatus = "needs_review";

function humanize(value: string): string {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "scout-run";
}

function escapeCsv(value: string | number): string {
  const text = String(value);

  if (!/[",\n\r]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function getAnnotation(
  annotationsByCandidate: Map<string, LeadAnnotation>,
  candidateId: string
): Pick<LeadAnnotation, "state" | "operatorNote" | "followUpDate"> {
  return (
    annotationsByCandidate.get(candidateId) ?? {
      state: DEFAULT_STATE,
      operatorNote: ""
    }
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

function buildOutreachSummary(
  annotation: Pick<LeadAnnotation, "state">,
  draft: OutreachDraft | undefined
): LeadOutreachSummary {
  if (!draft) {
    return {
      status: "no_draft",
      nextAction: annotation.state === "needs_review" ? "Review lead" : "Analyze contact"
    };
  }

  const status = !hasDraftContent(draft)
    ? "contact_analyzed"
    : draft.model
      ? "draft_ready"
      : "edited_saved";
  const recommendedChannelLabel = draft.recommendedChannel
    ? draft.contactChannels.find((channel) => channel.kind === draft.recommendedChannel)?.label
    : undefined;

  return {
    status,
    nextAction:
      annotation.state === "contacted"
        ? "Follow up"
        : annotation.state === "dismissed" || annotation.state === "not_a_fit"
          ? "Closed"
          : status === "contact_analyzed"
            ? "Draft outreach"
            : "Contact lead",
    draftId: draft.draftId,
    ...(draft.recommendedChannel ? { recommendedChannel: draft.recommendedChannel } : {}),
    ...(recommendedChannelLabel ? { recommendedChannelLabel } : {}),
    ...(draft.subjectLine.trim() ? { subjectLine: draft.subjectLine } : {}),
    draftUpdatedAt: draft.updatedAt
  };
}

function buildRows(
  report: ScoutRunReport,
  annotations: LeadAnnotation[],
  drafts: OutreachDraft[]
): LeadExportRow[] {
  const annotationsByCandidate = new Map(
    annotations.map((annotation) => [annotation.candidateId, annotation])
  );
  const draftsByCandidate = new Map(drafts.map((draft) => [draft.candidateId, draft]));
  const breakdownByCandidate = new Map(
    report.businessBreakdowns.map((business) => [business.candidateId, business])
  );
  const shortlistByCandidate = new Map(
    report.shortlist.map((lead, index) => [lead.candidateId, { lead, rank: index + 1 }])
  );
  const candidateIds = [
    ...new Set([
      ...report.shortlist.map((lead) => lead.candidateId),
      ...report.businessBreakdowns.map((business) => business.candidateId)
    ])
  ];

  return candidateIds.map((candidateId) => {
    const shortlist = shortlistByCandidate.get(candidateId);
    const business = breakdownByCandidate.get(candidateId);
    const source = buildRowSource(candidateId, business, shortlist?.lead);
    const annotation = getAnnotation(annotationsByCandidate, candidateId);
    const outreach = buildOutreachSummary(annotation, draftsByCandidate.get(candidateId));

    return {
      candidateId,
      businessName: source.businessName,
      primaryUrl: source.primaryUrl,
      state: annotation.state,
      operatorNote: annotation.operatorNote,
      followUpDate: annotation.followUpDate ?? "",
      shortlistRank: shortlist ? String(shortlist.rank) : "",
      priorityScore: shortlist ? String(shortlist.lead.priorityScore) : "",
      presenceType: source.presenceType,
      presenceQuality: source.presenceQuality,
      confidence: source.confidence,
      findingCount: source.findingCount,
      highSeverityFindings: source.highSeverityFindings,
      topIssues: source.topIssues,
      reasons: shortlist?.lead.reasons ?? [],
      outreach
    };
  });
}

function buildRowSource(
  candidateId: string,
  business: BusinessBreakdown | undefined,
  lead: LeadOpportunity | undefined
): {
  businessName: string;
  primaryUrl: string;
  presenceType: string;
  presenceQuality: string;
  confidence: string;
  findingCount: number;
  highSeverityFindings: number;
  topIssues: string[];
} {
  if (business) {
    return {
      businessName: business.businessName,
      primaryUrl: business.primaryUrl,
      presenceType: humanize(business.presenceType),
      presenceQuality: humanize(business.presenceQuality),
      confidence: humanize(business.confidence),
      findingCount: business.findingCount,
      highSeverityFindings: business.highSeverityFindings,
      topIssues: business.topIssues.map(humanize)
    };
  }

  return {
    businessName: lead?.businessName ?? candidateId,
    primaryUrl: lead?.primaryUrl ?? "",
    presenceType: lead ? humanize(lead.presenceType) : "",
    presenceQuality: lead ? humanize(lead.presenceQuality) : "",
    confidence: lead ? humanize(lead.confidence) : "",
    findingCount: 0,
    highSeverityFindings: 0,
    topIssues: []
  };
}

function buildCsv(rows: LeadExportRow[]): string {
  const headers = [
    "business_name",
    "state",
    "follow_up_date",
    "shortlist_rank",
    "priority_score",
    "primary_url",
    "presence_type",
    "presence_quality",
    "confidence",
    "finding_count",
    "high_severity_findings",
    "top_issues",
    "outreach_status",
    "recommended_channel",
    "outreach_next_action",
    "draft_updated_at",
    "operator_note",
    "reasons",
    "candidate_id"
  ];
  const lines = rows.map((row) =>
    [
      row.businessName,
      humanize(row.state),
      row.followUpDate,
      row.shortlistRank,
      row.priorityScore,
      row.primaryUrl,
      row.presenceType,
      row.presenceQuality,
      row.confidence,
      row.findingCount,
      row.highSeverityFindings,
      row.topIssues.join("; "),
      humanize(row.outreach.status),
      row.outreach.recommendedChannelLabel ?? (row.outreach.recommendedChannel ? humanize(row.outreach.recommendedChannel) : ""),
      row.outreach.nextAction,
      row.outreach.draftUpdatedAt ?? "",
      row.operatorNote,
      row.reasons.join("; "),
      row.candidateId
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

function buildMarkdown(report: ScoutRunReport, rows: LeadExportRow[], generatedAt: string): string {
  const sections = rows.map((row) => {
    const lines = [
      `## ${row.businessName}`,
      "",
      `- State: ${humanize(row.state)}`,
      `- Follow up: ${row.followUpDate || "None"}`,
      `- URL: ${row.primaryUrl || "None"}`,
      `- Shortlist rank: ${row.shortlistRank || "None"}`,
      `- Presence: ${row.presenceType || "Unknown"} / ${row.presenceQuality || "Unknown"}`,
      `- Confidence: ${row.confidence || "Unknown"}`,
      `- Findings: ${row.findingCount} (${row.highSeverityFindings} high severity)`,
      `- Top issues: ${row.topIssues.length > 0 ? row.topIssues.join(", ") : "None"}`,
      `- Outreach: ${humanize(row.outreach.status)}`,
      `- Recommended channel: ${
        row.outreach.recommendedChannelLabel ??
        (row.outreach.recommendedChannel ? humanize(row.outreach.recommendedChannel) : "None")
      }`,
      `- Next action: ${row.outreach.nextAction}`,
      `- Note: ${row.operatorNote || "None"}`
    ];

    if (row.reasons.length > 0) {
      lines.push("", "Reasons:", ...row.reasons.map((reason) => `- ${reason}`));
    }

    return lines.join("\n");
  });

  return [
    `# Scout Leads: ${report.intent.marketTerm}`,
    "",
    `Run: ${report.runId}`,
    `Query: ${report.query.rawQuery}`,
    `Generated: ${generatedAt}`,
    "",
    ...sections
  ]
    .join("\n")
    .trim();
}

function buildInboxCsv(items: LeadInboxItem[]): string {
  const headers = [
    "business_name",
    "state",
    "follow_up_date",
    "market",
    "sample_quality",
    "query",
    "run_id",
    "shortlist_rank",
    "priority_score",
    "primary_url",
    "presence_type",
    "presence_quality",
    "confidence",
    "finding_count",
    "high_severity_findings",
    "top_issues",
    "outreach_status",
    "recommended_channel",
    "outreach_next_action",
    "draft_updated_at",
    "operator_note",
    "reasons",
    "candidate_id"
  ];
  const lines = items.map((item) =>
    [
      item.businessName,
      humanize(item.annotation.state),
      item.annotation.followUpDate ?? "",
      item.marketTerm,
      item.sampleQuality ? humanize(item.sampleQuality) : "",
      item.rawQuery,
      item.runId,
      item.shortlistRank ?? "",
      item.priorityScore ?? "",
      item.primaryUrl,
      item.presenceType ? humanize(item.presenceType) : "",
      item.presenceQuality ? humanize(item.presenceQuality) : "",
      item.confidence ? humanize(item.confidence) : "",
      item.findingCount,
      item.highSeverityFindings,
      item.topIssues.map(humanize).join("; "),
      humanize(item.outreach.status),
      item.outreach.recommendedChannelLabel ??
        (item.outreach.recommendedChannel ? humanize(item.outreach.recommendedChannel) : ""),
      item.outreach.nextAction,
      item.outreach.draftUpdatedAt ?? "",
      item.annotation.operatorNote,
      item.reasons.join("; "),
      item.candidateId
    ]
      .map(escapeCsv)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

function buildInboxMarkdown(items: LeadInboxItem[], generatedAt: string): string {
  const sections = items.map((item) => {
    const lines = [
      `## ${item.businessName}`,
      "",
      `- State: ${humanize(item.annotation.state)}`,
      `- Follow up: ${item.annotation.followUpDate ?? "None"}`,
      `- Market: ${item.marketTerm}`,
      `- Sample quality: ${item.sampleQuality ? humanize(item.sampleQuality) : "Unknown"}`,
      `- Query: ${item.rawQuery}`,
      `- Run: ${item.runId}`,
      `- URL: ${item.primaryUrl || "None"}`,
      `- Shortlist rank: ${item.shortlistRank ?? "None"}`,
      `- Priority score: ${item.priorityScore ?? "None"}`,
      `- Presence: ${item.presenceType ? humanize(item.presenceType) : "Unknown"} / ${
        item.presenceQuality ? humanize(item.presenceQuality) : "Unknown"
      }`,
      `- Confidence: ${item.confidence ? humanize(item.confidence) : "Unknown"}`,
      `- Findings: ${item.findingCount} (${item.highSeverityFindings} high severity)`,
      `- Top issues: ${item.topIssues.length > 0 ? item.topIssues.map(humanize).join(", ") : "None"}`,
      `- Outreach: ${humanize(item.outreach.status)}`,
      `- Recommended channel: ${
        item.outreach.recommendedChannelLabel ??
        (item.outreach.recommendedChannel ? humanize(item.outreach.recommendedChannel) : "None")
      }`,
      `- Next action: ${item.outreach.nextAction}`,
      `- Note: ${item.annotation.operatorNote || "None"}`
    ];

    if (item.reasons.length > 0) {
      lines.push("", "Reasons:", ...item.reasons.map((reason) => `- ${reason}`));
    }

    return lines.join("\n");
  });

  return ["# Scout Lead Inbox", "", `Generated: ${generatedAt}`, "", ...sections]
    .join("\n")
    .trim();
}

export async function buildLeadExport(input: {
  runId: string;
  format: LeadExportFormat;
}): Promise<LeadExportResult> {
  const report = await getScoutRun(input.runId);

  if (!report) {
    throw new Error("Scout run not found.");
  }

  const annotations = await getLeadAnnotations(input.runId);
  const drafts = await createOutreachDraftRepository().listByRun(input.runId);
  const rows = buildRows(report, annotations, drafts);
  const generatedAt = new Date().toISOString();
  const baseName = sanitizeFileSegment(`scout-leads-${report.intent.marketTerm}-${report.runId}`);

  if (input.format === "markdown") {
    return {
      body: buildMarkdown(report, rows, generatedAt),
      contentType: "text/markdown; charset=utf-8",
      filename: `${baseName}.md`
    };
  }

  return {
    body: buildCsv(rows),
    contentType: "text/csv; charset=utf-8",
    filename: `${baseName}.csv`
  };
}

export async function buildLeadInboxExport(input: {
  format: LeadExportFormat;
  filters?: LeadInboxFilters | undefined;
}): Promise<LeadExportResult> {
  const generatedAt = new Date().toISOString();
  const items = filterLeadInboxItems(await listLeadInboxItems(500), {
    ...input.filters,
    today: input.filters?.today ?? generatedAt.slice(0, 10)
  });
  const baseName = `scout-lead-inbox-${generatedAt.slice(0, 10)}`;

  if (input.format === "markdown") {
    return {
      body: buildInboxMarkdown(items, generatedAt),
      contentType: "text/markdown; charset=utf-8",
      filename: `${baseName}.md`
    };
  }

  return {
    body: buildInboxCsv(items),
    contentType: "text/csv; charset=utf-8",
    filename: `${baseName}.csv`
  };
}
