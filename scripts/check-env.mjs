import { existsSync } from "node:fs";

const env = process.env;

if (typeof process.loadEnvFile === "function") {
  for (const fileName of [".env", ".env.local"]) {
    if (existsSync(fileName)) {
      process.loadEnvFile(fileName);
    }
  }
}

function parseNumber(name, fallback) {
  const value = env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

const minCandidates = parseNumber("SCOUT_MIN_CANDIDATES", 10);
const maxCandidates = parseNumber("SCOUT_MAX_CANDIDATES", 15);
const workerPollMs = parseNumber("SCOUT_WORKER_POLL_MS", 2000);
const workerStaleRunMs = parseNumber("SCOUT_WORKER_STALE_RUN_MS", 2_700_000);
const interactiveSearchTimeoutMs = parseNumber("SCOUT_INTERACTIVE_SEARCH_TIMEOUT_MS", 180_000);
const searchProvider = env.SCOUT_SEARCH_PROVIDER || "duckduckgo_html";
const interactiveSearchEnabled = ["1", "true", "yes"].includes(
  (env.SCOUT_INTERACTIVE_SEARCH || "0").toLowerCase()
);
const outreachModel = env.SCOUT_OUTREACH_MODEL;
const outreachDefaultTone = env.SCOUT_OUTREACH_DEFAULT_TONE || "calm";
const outreachDefaultLength = env.SCOUT_OUTREACH_DEFAULT_LENGTH || "standard";

if (minCandidates < 1) {
  throw new Error("SCOUT_MIN_CANDIDATES must be at least 1.");
}

if (maxCandidates < minCandidates) {
  throw new Error("SCOUT_MAX_CANDIDATES must be greater than or equal to SCOUT_MIN_CANDIDATES.");
}

if (workerPollMs < 250) {
  throw new Error("SCOUT_WORKER_POLL_MS must be at least 250.");
}

if (workerStaleRunMs < workerPollMs) {
  throw new Error("SCOUT_WORKER_STALE_RUN_MS must be greater than or equal to SCOUT_WORKER_POLL_MS.");
}

if (interactiveSearchTimeoutMs < 30_000) {
  throw new Error("SCOUT_INTERACTIVE_SEARCH_TIMEOUT_MS must be at least 30000.");
}

if (interactiveSearchEnabled && !env.SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR) {
  throw new Error(
    "SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR is required when SCOUT_INTERACTIVE_SEARCH is enabled."
  );
}

if (!["duckduckgo_html", "google_html", "bing_html", "seeded_stub"].includes(searchProvider)) {
  throw new Error(
    "SCOUT_SEARCH_PROVIDER must be `duckduckgo_html`, `google_html`, `bing_html`, or `seeded_stub`."
  );
}

if (searchProvider === "seeded_stub") {
  console.warn(
    "SCOUT_SEARCH_PROVIDER=seeded_stub is intended for verification only. Normal Scout runs now stay live-only."
  );
}

if (outreachModel && outreachModel.trim().length === 0) {
  throw new Error("SCOUT_OUTREACH_MODEL must not be empty when provided.");
}

if (!["calm", "direct", "friendly"].includes(outreachDefaultTone)) {
  throw new Error("SCOUT_OUTREACH_DEFAULT_TONE must be `calm`, `direct`, or `friendly`.");
}

if (!["brief", "standard"].includes(outreachDefaultLength)) {
  throw new Error("SCOUT_OUTREACH_DEFAULT_LENGTH must be `brief` or `standard`.");
}

const evidenceDriver = env.EVIDENCE_STORAGE_DRIVER || "local";
if (!["local", "s3"].includes(evidenceDriver)) {
  throw new Error("EVIDENCE_STORAGE_DRIVER must be `local` or `s3`.");
}

if (evidenceDriver === "s3") {
  throw new Error("Scout v1 only implements local evidence storage. Set EVIDENCE_STORAGE_DRIVER=local.");
}

const appUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
new URL(appUrl);

const databaseUrl = env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Scout now uses Postgres for run persistence.");
}

new URL(databaseUrl);

console.log("Environment configuration is valid for Scout v1.");
