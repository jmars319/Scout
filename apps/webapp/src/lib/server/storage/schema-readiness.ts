import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPostgresClient } from "./postgres-client.ts";

export interface DatabaseReadiness {
  ok: boolean;
  databaseUrl?: string | undefined;
  schemaReady: boolean;
  schemaPath?: string | undefined;
  message: string;
}

function resolveSchemaPath(): string {
  if (process.env.SCOUT_SCHEMA_PATH?.trim()) {
    return process.env.SCOUT_SCHEMA_PATH.trim();
  }

  return path.resolve(
    process.env.SCOUT_RUNTIME_ROOT?.trim() || process.cwd(),
    "scripts/sql/001_create_scout_runs.sql"
  );
}

async function applySchema(schemaPath: string): Promise<void> {
  const sql = getPostgresClient();
  const schema = await readFile(schemaPath, "utf8");

  await sql.unsafe(schema);
}

export async function checkDatabaseReadiness({
  ensureSchema = false
}: {
  ensureSchema?: boolean | undefined;
} = {}): Promise<DatabaseReadiness> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const schemaPath = resolveSchemaPath();

  if (!databaseUrl) {
    return {
      ok: false,
      schemaReady: false,
      schemaPath,
      message: "DATABASE_URL is not set."
    };
  }

  try {
    const sql = getPostgresClient();
    await sql`select 1`;

    if (ensureSchema) {
      await applySchema(schemaPath);
    }

    const [row] = await sql<Array<{ table_name: string | null }>>`
      select to_regclass('public.scout_runs')::text as table_name
    `;
    const schemaReady = Boolean(row?.table_name);

    return {
      ok: schemaReady,
      databaseUrl,
      schemaReady,
      schemaPath,
      message: schemaReady
        ? "Scout local database is reachable and the schema is ready."
        : "Scout database is reachable, but the schema has not been prepared."
    };
  } catch (error) {
    return {
      ok: false,
      databaseUrl,
      schemaReady: false,
      schemaPath,
      message: error instanceof Error ? error.message : "Unknown Scout database readiness failure."
    };
  }
}
