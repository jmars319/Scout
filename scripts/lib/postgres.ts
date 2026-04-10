import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  closePostgresClient,
  getPostgresClient
} from "../../apps/webapp/src/lib/server/storage/postgres-client.ts";

import { getRepoRoot } from "./env.ts";

export async function applyScoutSchema(): Promise<void> {
  const sql = getPostgresClient();
  const schemaPath = path.resolve(getRepoRoot(), "scripts/sql/001_create_scout_runs.sql");
  const schema = await readFile(schemaPath, "utf8");

  await sql.unsafe(schema);
}

export async function closeScoutSchemaClient(): Promise<void> {
  await closePostgresClient();
}
