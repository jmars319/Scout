import { listLegacyRunImportCandidates } from "../apps/webapp/src/lib/server/storage/legacy-local-runs.ts";
import { createRunRepository } from "../apps/webapp/src/lib/server/storage/run-repository.ts";

import { loadWorkspaceEnv } from "./lib/env.ts";
import { applyScoutSchema, closeScoutSchemaClient } from "./lib/postgres.ts";

loadWorkspaceEnv();

try {
  await applyScoutSchema();

  const repository = createRunRepository();
  const candidates = await listLegacyRunImportCandidates();

  if (candidates.length === 0) {
    console.log("No local run files were found for import.");
  } else {
    for (const candidate of candidates) {
      await repository.upsertRecord(candidate.record);
    }

    console.log(`Imported ${candidates.length} local run file(s) into Postgres.`);
  }
} finally {
  await closeScoutSchemaClient();
}
