import type {
  PresenceAuditResult,
  PresenceRecord,
  ResolvedMarketIntent,
  ScoutAcquisitionResult,
  ScoutQueryInput,
  ScoutRunReport,
} from "./model.ts";

export interface RunScoutDependencies {
  resolveIntent: (input: ScoutQueryInput) => Promise<ResolvedMarketIntent> | ResolvedMarketIntent;
  searchCandidates: (intent: ResolvedMarketIntent) => Promise<ScoutAcquisitionResult>;
  detectPresence: (
    candidate: ScoutAcquisitionResult["candidates"][number],
    intent: ResolvedMarketIntent
  ) => Promise<PresenceRecord>;
  auditPresence: (
    presence: PresenceRecord,
    intent: ResolvedMarketIntent
  ) => Promise<PresenceAuditResult>;
  now?: () => Date;
  generateRunId?: () => string;
  onCompleted?: (report: ScoutRunReport) => Promise<void> | void;
}
