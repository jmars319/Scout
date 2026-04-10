import { getWorkerConfig } from "@scout/config";

import { startScoutWorker } from "../lib/server/worker/scout-worker.ts";

const workerConfig = getWorkerConfig();
const once = process.argv.includes("--once");

console.log(
  `Scout worker starting with poll ${workerConfig.pollMs}ms and stale-run threshold ${workerConfig.staleRunMs}ms.`
);

await startScoutWorker({
  pollMs: workerConfig.pollMs,
  staleRunMs: workerConfig.staleRunMs,
  once
});
