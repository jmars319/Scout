import type { ViewportKind } from "@scout/domain";

export const APP_NAME = "Scout by JAMARQ";

export interface ViewportPreset {
  kind: ViewportKind;
  label: string;
  width: number;
  height: number;
}

export const VIEWPORT_PRESETS: Record<ViewportKind, ViewportPreset> = {
  desktop: {
    kind: "desktop",
    label: "Desktop 1440x900",
    width: 1440,
    height: 900
  },
  mobile: {
    kind: "mobile",
    label: "Mobile 390x844",
    width: 390,
    height: 844
  }
};

export interface ScoutLimits {
  minCandidates: number;
  maxCandidates: number;
}

export interface EvidenceStorageConfig {
  driver: "local" | "s3";
  localDir: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface WorkerConfig {
  pollMs: number;
  staleRunMs: number;
}

export function getAppName(source: Record<string, string | undefined> = process.env): string {
  return source.APP_NAME?.trim() || APP_NAME;
}

export function getScoutLimits(source: Record<string, string | undefined> = process.env): ScoutLimits {
  const minCandidates = Number(source.SCOUT_MIN_CANDIDATES ?? 10);
  const maxCandidates = Number(source.SCOUT_MAX_CANDIDATES ?? 15);

  return {
    minCandidates: Number.isFinite(minCandidates) ? minCandidates : 10,
    maxCandidates: Number.isFinite(maxCandidates) ? maxCandidates : 15
  };
}

export function getSearchProviderName(source: Record<string, string | undefined> = process.env): string {
  return source.SCOUT_SEARCH_PROVIDER?.trim() || "duckduckgo_html";
}

export function getEvidenceStorageConfig(
  source: Record<string, string | undefined> = process.env
): EvidenceStorageConfig {
  const driver = source.EVIDENCE_STORAGE_DRIVER === "s3" ? "s3" : "local";
  return {
    driver,
    localDir: source.EVIDENCE_LOCAL_DIR?.trim() || "./data/evidence"
  };
}

export function getPublicAppUrl(source: Record<string, string | undefined> = process.env): string {
  return source.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
}

export function getDatabaseConfig(
  source: Record<string, string | undefined> = process.env
): DatabaseConfig {
  const url = source.DATABASE_URL?.trim();

  if (!url) {
    throw new Error("DATABASE_URL is required for Scout run persistence.");
  }

  return { url };
}

export function getWorkerConfig(
  source: Record<string, string | undefined> = process.env
): WorkerConfig {
  const pollMs = Number(source.SCOUT_WORKER_POLL_MS ?? 2000);
  const staleRunMs = Number(source.SCOUT_WORKER_STALE_RUN_MS ?? 2_700_000);

  return {
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : 2000,
    staleRunMs: Number.isFinite(staleRunMs) && staleRunMs > 0 ? staleRunMs : 2_700_000
  };
}
