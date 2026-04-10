import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

try {
  await applyScoutSchema();
  console.log("Scout Postgres schema is ready.");
} finally {
  await closeScoutSchemaClient();
}
