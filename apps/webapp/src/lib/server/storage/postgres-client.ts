import postgres, { type Sql } from "postgres";

import { getDatabaseConfig } from "@scout/config";

declare global {
  var __scoutPostgresClient__: Sql | undefined;
}

function createSqlClient(): Sql {
  const config = getDatabaseConfig();

  return postgres(config.url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {}
  });
}

export function getPostgresClient(): Sql {
  if (!globalThis.__scoutPostgresClient__) {
    globalThis.__scoutPostgresClient__ = createSqlClient();
  }

  return globalThis.__scoutPostgresClient__;
}

export async function closePostgresClient(): Promise<void> {
  if (!globalThis.__scoutPostgresClient__) {
    return;
  }

  await globalThis.__scoutPostgresClient__.end({ timeout: 5 });
  globalThis.__scoutPostgresClient__ = undefined;
}
