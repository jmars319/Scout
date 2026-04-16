import { getWorkerConfig } from "@scout/config";

import { startScoutWorker } from "../lib/server/worker/scout-worker.ts";

export async function runWorkerCli(argv: string[] = process.argv): Promise<void> {
  const workerConfig = getWorkerConfig();
  const once = argv.includes("--once");

  console.log(
    `Scout worker starting with poll ${workerConfig.pollMs}ms and stale-run threshold ${workerConfig.staleRunMs}ms.`
  );

  await startScoutWorker({
    pollMs: workerConfig.pollMs,
    staleRunMs: workerConfig.staleRunMs,
    once
  });
}

void runWorkerCli().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown Scout worker startup failure.");
  process.exit(1);
});
