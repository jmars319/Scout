export const presenceTypes = [
  "owned_website",
  "facebook_only",
  "yelp_only",
  "directory_only",
  "marketplace",
  "dead",
  "blocked",
  "unknown"
] as const;

export const presenceQualities = ["none", "weak", "functional", "broken", "strong"] as const;

export const opportunityTypes = [
  "build",
  "rebuild",
  "repair",
  "conversion_improvement",
  "accessibility_fix",
  "performance_fix"
] as const;

export const confidenceLevels = ["confirmed", "probable", "inferred"] as const;

export const findingSeverities = ["low", "medium", "high", "critical"] as const;
export const runStatuses = ["queued", "running", "completed", "failed"] as const;
export const runExecutionStages = [
  "queued",
  "starting",
  "acquiring_candidates",
  "evaluating_presences",
  "auditing_websites",
  "building_shortlist",
  "finalizing_report",
  "completed",
  "failed"
] as const;
export const outreachTones = ["calm", "direct", "friendly"] as const;
export const outreachLengths = ["brief", "standard"] as const;
export const outreachChannelKinds = [
  "email",
  "contact_form",
  "phone",
  "facebook_dm",
  "instagram_dm",
  "linkedin_message",
  "website"
] as const;

export const viewportKinds = ["desktop", "mobile"] as const;
export const marketSampleQualities = [
  "strong_sample",
  "adequate_sample",
  "partial_sample",
  "weak_sample"
] as const;
export const acquisitionAttemptOutcomes = [
  "success",
  "empty",
  "blocked",
  "parse_error",
  "network_error",
  "http_error"
] as const;
export const acquisitionSourceKinds = ["live", "fallback"] as const;
export const acquisitionFallbackTriggerReasons = [
  "fallback_only_mode",
  "insufficient_live_candidates",
  "provider_empty",
  "provider_blocked",
  "provider_parse_failure",
  "provider_network_error",
  "provider_http_error"
] as const;

export const auditIssueTypes = [
  "console_error",
  "failed_request",
  "broken_navigation",
  "missing_contact_path",
  "missing_primary_cta",
  "accessibility_issue",
  "mobile_layout_issue",
  "tap_target_issue",
  "blocked_content",
  "dead_page",
  "weak_trust_signal"
] as const;

export type PresenceType = (typeof presenceTypes)[number];
export type PresenceQuality = (typeof presenceQualities)[number];
export type OpportunityType = (typeof opportunityTypes)[number];
export type ConfidenceLevel = (typeof confidenceLevels)[number];
export type FindingSeverity = (typeof findingSeverities)[number];
export type RunStatus = (typeof runStatuses)[number];
export type RunExecutionStage = (typeof runExecutionStages)[number];
export type OutreachTone = (typeof outreachTones)[number];
export type OutreachLength = (typeof outreachLengths)[number];
export type OutreachChannelKind = (typeof outreachChannelKinds)[number];
export type ViewportKind = (typeof viewportKinds)[number];
export type AuditIssueType = (typeof auditIssueTypes)[number];
export type MarketSampleQuality = (typeof marketSampleQualities)[number];
export type AcquisitionAttemptOutcome = (typeof acquisitionAttemptOutcomes)[number];
export type AcquisitionSourceKind = (typeof acquisitionSourceKinds)[number];
export type AcquisitionFallbackTriggerReason = (typeof acquisitionFallbackTriggerReasons)[number];

export interface ScoutQueryInput {
  rawQuery: string;
}

export interface ResolvedMarketIntent {
  originalQuery: string;
  normalizedQuery: string;
  marketTerm: string;
  categories: string[];
  locationLabel?: string;
  locationCity?: string;
  locationRegion?: string;
  searchQuery: string;
}

export interface SearchCandidate {
  candidateId: string;
  rank: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  source: string;
}

export interface AcquisitionQueryVariant {
  label: string;
  query: string;
  source: string;
  rawResultCount: number;
  acceptedResultCount: number;
}

export interface AcquisitionDuplicateRecord {
  keptCandidateId: string;
  duplicateCandidateId: string;
  reason: string;
}

export interface AcquisitionDiscardRecord {
  candidateId: string;
  reason: string;
}

export interface AcquisitionProviderAttempt {
  provider: string;
  kind: AcquisitionSourceKind;
  variantLabel: string;
  query: string;
  outcome: AcquisitionAttemptOutcome;
  rawResultCount: number;
  httpStatus?: number | undefined;
  detail?: string | undefined;
}

export interface AcquisitionSourceCount {
  source: string;
  kind: AcquisitionSourceKind;
  rawCandidateCount: number;
  selectedCandidateCount: number;
}

export interface AcquisitionFallbackTrigger {
  reason: AcquisitionFallbackTriggerReason;
  provider?: string | undefined;
  detail?: string | undefined;
}

export interface AcquisitionDiagnostics {
  provider: string;
  fallbackUsed: boolean;
  rawCandidateCount: number;
  selectedCandidateCount: number;
  liveCandidateCount: number;
  fallbackCandidateCount: number;
  mergedDuplicateCount: number;
  discardedCandidateCount: number;
  sampleQuality: MarketSampleQuality;
  queryVariants: AcquisitionQueryVariant[];
  providerAttempts: AcquisitionProviderAttempt[];
  candidateSources: AcquisitionSourceCount[];
  fallbackTriggers: AcquisitionFallbackTrigger[];
  mergedDuplicates: AcquisitionDuplicateRecord[];
  discardedCandidates: AcquisitionDiscardRecord[];
  notes: string[];
}

export interface ScoutAcquisitionResult {
  candidates: SearchCandidate[];
  diagnostics: AcquisitionDiagnostics;
}

export interface PresenceRecord {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  domain: string;
  searchRank: number;
  presenceType: PresenceType;
  auditEligible: boolean;
  secondaryUrls: string[];
  detectionNotes: string[];
}

export interface AuditPageTarget {
  label: "homepage" | "secondary";
  url: string;
}

export interface AuditFinding {
  id: string;
  candidateId: string;
  pageUrl: string;
  pageLabel: "homepage" | "secondary";
  viewport: ViewportKind;
  issueType: AuditIssueType;
  severity: FindingSeverity;
  confidence: ConfidenceLevel;
  message: string;
  reproductionNote: string;
  screenshotUrl?: string;
  screenshotPath?: string;
  ruleId?: string;
}

export interface PresenceAuditResult {
  candidateId: string;
  targets: AuditPageTarget[];
  findings: AuditFinding[];
  notes: string[];
}

export interface BusinessClassification {
  candidateId: string;
  presenceQuality: PresenceQuality;
  opportunityTypes: OpportunityType[];
  confidence: ConfidenceLevel;
  rationale: string[];
}

export interface LeadOpportunity {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  presenceType: PresenceType;
  presenceQuality: PresenceQuality;
  opportunityTypes: OpportunityType[];
  confidence: ConfidenceLevel;
  priorityScore: number;
  reasons: string[];
}

export interface CommonIssueCount {
  issueType: AuditIssueType;
  count: number;
}

export interface BusinessBreakdown {
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  searchRank: number;
  presenceType: PresenceType;
  presenceQuality: PresenceQuality;
  opportunityTypes: OpportunityType[];
  confidence: ConfidenceLevel;
  findingCount: number;
  highSeverityFindings: number;
  audited: boolean;
  auditStatus: "audited" | "skipped";
  topIssues: AuditIssueType[];
  secondaryUrls: string[];
  detectionNotes: string[];
}

export interface ScoutRunSummary {
  totalCandidates: number;
  auditedPresences: number;
  skippedPresences: number;
  sampleQuality: MarketSampleQuality;
  presenceBreakdown: Record<PresenceType, number>;
  qualityBreakdown: Record<PresenceQuality, number>;
  commonIssues: CommonIssueCount[];
}

export interface ScoutRunReport {
  schemaVersion: 2;
  runId: string;
  status: "completed" | "failed";
  createdAt: string;
  query: ScoutQueryInput;
  intent: ResolvedMarketIntent;
  acquisition: AcquisitionDiagnostics;
  searchSource: string;
  candidates: SearchCandidate[];
  presences: PresenceRecord[];
  findings: AuditFinding[];
  classifications: BusinessClassification[];
  businessBreakdowns: BusinessBreakdown[];
  shortlist: LeadOpportunity[];
  summary: ScoutRunSummary;
  notes: string[];
  errorMessage?: string;
}

export interface OutreachProfile {
  profileId: string;
  senderName: string;
  companyName: string;
  roleTitle: string;
  serviceLine: string;
  serviceSummary: string;
  defaultCallToAction: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  schedulerUrl: string;
  toneNotes: string;
  avoidPhrases: string[];
  signature: string;
  updatedAt?: string | undefined;
}

export interface OutreachDraft {
  draftId: string;
  runId: string;
  candidateId: string;
  businessName: string;
  primaryUrl: string;
  tone: OutreachTone;
  length: OutreachLength;
  recommendedChannel?: OutreachChannelKind | undefined;
  contactChannels: OutreachContactChannel[];
  contactRationale: string[];
  subjectLine: string;
  body: string;
  shortMessage?: string | undefined;
  phoneTalkingPoints?: OutreachPhoneTalkingPoints | undefined;
  grounding: string[];
  createdAt: string;
  updatedAt: string;
  model?: string | undefined;
}

export interface OutreachContactChannel {
  kind: OutreachChannelKind;
  label: string;
  value?: string | undefined;
  url?: string | undefined;
  score: number;
  reason: string;
}

export interface OutreachPhoneTalkingPoints {
  opener: string;
  keyPoints: string[];
  close: string;
}
