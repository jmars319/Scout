import {
  buildRunSummary,
  createEmptyAcquisitionDiagnostics,
  resolveMarketIntent,
  type ResolvedMarketIntent,
  type ScoutQueryInput,
  type ScoutRunReport
} from "@scout/domain";

export function buildFailedReport(input: {
  runId: string;
  query: ScoutQueryInput;
  errorMessage: string;
  intent?: ResolvedMarketIntent;
  createdAt?: Date;
}): ScoutRunReport {
  const createdAt = input.createdAt ?? new Date();
  const acquisition = createEmptyAcquisitionDiagnostics("unresolved");

  return {
    schemaVersion: 2,
    runId: input.runId,
    status: "failed",
    createdAt: createdAt.toISOString(),
    query: input.query,
    intent: input.intent ?? resolveMarketIntent(input.query),
    acquisition,
    searchSource: "unresolved",
    candidates: [],
    presences: [],
    findings: [],
    classifications: [],
    businessBreakdowns: [],
    shortlist: [],
    summary: buildRunSummary([], [], [], acquisition.sampleQuality, new Set()),
    notes: ["Scout stopped before the report could be completed."],
    errorMessage: input.errorMessage
  };
}
