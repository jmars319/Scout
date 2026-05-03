import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPostgresClient } from "./postgres-client.ts";

export interface DatabaseReadiness {
  ok: boolean;
  databaseUrl?: string | undefined;
  schemaReady: boolean;
  schemaPath?: string | undefined;
  desktopEnvFile?: string | undefined;
  message: string;
  setupHint?: string | undefined;
}

function resolveSchemaPath(): string {
  if (process.env.SCOUT_SCHEMA_PATH?.trim()) {
    return process.env.SCOUT_SCHEMA_PATH.trim();
  }

  const roots = [process.cwd(), path.resolve(process.cwd(), "../..")];
  const runtimeRoot = process.env.SCOUT_RUNTIME_ROOT?.trim();

  if (runtimeRoot) {
    roots.unshift(runtimeRoot);
  }

  const candidates = roots.map((root) =>
    path.resolve(root, "scripts/sql/001_create_scout_runs.sql")
  );

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]!;
}

async function applySchema(schemaPath: string): Promise<void> {
  const sql = getPostgresClient();
  const schema = await readFile(schemaPath, "utf8");

  await sql.unsafe(schema);
}

function getDesktopEnvFile(): string | undefined {
  const envFilePath = process.env.SCOUT_DESKTOP_ENV_FILE?.trim();
  return envFilePath || undefined;
}

function buildSetupHint(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("database") &&
    (normalized.includes("does not exist") || normalized.includes("doesn't exist"))
  ) {
    return "Create the local Scout database with `createdb scout`, then launch Scout again.";
  }

  if (
    normalized.includes("econnrefused") ||
    normalized.includes("connection refused") ||
    normalized.includes("connect enoent")
  ) {
    return "Start local Postgres, then launch Scout again. For Homebrew, `brew services start postgresql` is the usual path.";
  }

  if (normalized.includes("authentication") || normalized.includes("password")) {
    return "Update the desktop env file with a DATABASE_URL that matches your local Postgres credentials.";
  }

  return "Confirm local Postgres is running, the `scout` database exists, and DATABASE_URL points at it.";
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
      ...(getDesktopEnvFile() ? { desktopEnvFile: getDesktopEnvFile() } : {}),
      message: "DATABASE_URL is not set.",
      setupHint: "Set DATABASE_URL in the Scout desktop env file, or use the default `postgresql:///scout` after creating the local database."
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
      ...(getDesktopEnvFile() ? { desktopEnvFile: getDesktopEnvFile() } : {}),
      message: schemaReady
        ? "Scout local database is reachable and the schema is ready."
        : "Scout database is reachable, but the schema has not been prepared.",
      ...(!schemaReady
        ? { setupHint: "Run `pnpm run db:prepare`, or launch packaged Scout again so it can apply the bundled schema." }
        : {})
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Scout database readiness failure.";

    return {
      ok: false,
      databaseUrl,
      schemaReady: false,
      schemaPath,
      ...(getDesktopEnvFile() ? { desktopEnvFile: getDesktopEnvFile() } : {}),
      message,
      setupHint: buildSetupHint(message)
    };
  }
}
