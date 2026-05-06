import { spawnSync } from "node:child_process";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

const defaultDatabaseUrl = "postgresql:///scout";
const databaseUrl = process.env.DATABASE_URL?.trim() || defaultDatabaseUrl;
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//u, ""));

if (!databaseName) {
  console.error("DATABASE_URL must include a database name.");
  process.exit(1);
}

process.env.DATABASE_URL = databaseUrl;

const maintenanceUrl = new URL(databaseUrl);
maintenanceUrl.pathname = "/postgres";
maintenanceUrl.search = "";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe"
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    output: (result.stdout || result.stderr || "").trim()
  };
}

for (const tool of ["psql", "createdb"]) {
  const result = run(tool, ["--version"]);

  if (!result.ok) {
    console.error(`${tool} is required for Scout database preparation.`);
    process.exit(result.status);
  }
}

const existsResult = run("psql", [
  maintenanceUrl.toString(),
  "-tAc",
  `SELECT 1 FROM pg_database WHERE datname = '${databaseName.replaceAll("'", "''")}';`
]);

if (!existsResult.ok) {
  console.error(existsResult.output || "Unable to inspect local Postgres databases.");
  process.exit(existsResult.status);
}

if (existsResult.output.trim() === "1") {
  console.log(`Database exists: ${databaseName}`);
} else {
  const createResult = run("createdb", ["--maintenance-db", maintenanceUrl.toString(), databaseName]);

  if (!createResult.ok) {
    console.error(createResult.output || `Unable to create database: ${databaseName}`);
    process.exit(createResult.status);
  }

  console.log(`Database created: ${databaseName}`);
}

try {
  await applyScoutSchema();
  console.log(`Scout Postgres schema is ready at ${databaseUrl}.`);
} finally {
  await closeScoutSchemaClient();
}
