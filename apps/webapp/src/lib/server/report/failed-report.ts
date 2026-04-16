import {
  type AcquisitionDiagnostics,
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
  acquisition?: AcquisitionDiagnostics;
  searchSource?: string;
  notes?: string[];
}): ScoutRunReport {
  const createdAt = input.createdAt ?? new Date();
  const acquisition = input.acquisition ?? createEmptyAcquisitionDiagnostics("unresolved");
  const notes = [
    ...(input.notes ?? []),
    "Scout stopped before the report could be completed."
  ];

  return {
    schemaVersion: 2,
    runId: input.runId,
    status: "failed",
    createdAt: createdAt.toISOString(),
    query: input.query,
    intent: input.intent ?? resolveMarketIntent(input.query),
    acquisition,
    searchSource: input.searchSource ?? acquisition.provider,
    candidates: [],
    presences: [],
    findings: [],
    classifications: [],
    businessBreakdowns: [],
    shortlist: [],
    summary: buildRunSummary([], [], [], acquisition.sampleQuality, new Set()),
    notes: [...new Set(notes)],
    errorMessage: input.errorMessage
  };
}
