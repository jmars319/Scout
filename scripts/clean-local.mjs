import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fullCleanupLocalState,
  getSourceDesktopLocalState,
  pruneInteractiveSearchCaches
} from "../apps/desktopapp/scripts/lib/local-state.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const localState = getSourceDesktopLocalState(repoRoot);
const fullCleanup = process.argv.includes("--full");
const helpRequested = process.argv.includes("--help") || process.argv.includes("-h");

function printHelp() {
  console.log(`Scout local cleanup

Usage:
  pnpm run clean:local
  pnpm run clean:local:full
  node ./scripts/clean-local.mjs [--full]

Default cleanup prunes cache-heavy Chromium folders under .local/interactive-search
and preserves cookies/session data for desktop manual-confirmation flows.

Full cleanup removes:
  - .local/interactive-search
  - .local/desktop-cleanup.json
  - data/evidence

Postgres run history is not deleted.`);
}

if (helpRequested) {
  printHelp();
  process.exit(0);
}

if (fullCleanup) {
  console.log("Running full Scout local cleanup.");
  await fullCleanupLocalState({
    profileDir: localState.profileDir,
    evidenceDir: localState.evidenceDir,
    cleanupStateFilePath: localState.cleanupStateFilePath,
    logger: console
  });
  process.exit(0);
}

console.log("Pruning Scout interactive-search caches.");
const result = await pruneInteractiveSearchCaches({
  profileDir: localState.profileDir,
  logger: console
});

if (result.removedDirectories.length === 0) {
  console.log("No Scout interactive-search cache directories were present to prune.");
}
