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
