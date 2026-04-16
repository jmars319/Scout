import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const AUTO_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PROFILE_CACHE_DIRECTORIES = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "GrShaderCache",
  "GraphiteDawnCache",
  "ShaderCache",
  "Safe Browsing",
  "component_crx_cache",
  "extensions_crx_cache",
  path.join("Default", "Cache"),
  path.join("Default", "Code Cache"),
  path.join("Default", "GPUCache"),
  path.join("Default", "DawnGraphiteCache"),
  path.join("Default", "DawnWebGPUCache"),
  path.join("Default", "Service Worker", "CacheStorage")
];

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readCleanupState(stateFilePath) {
  try {
    const raw = await readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed.lastAutoCleanupAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCleanupState(stateFilePath, timestamp) {
  await mkdir(path.dirname(stateFilePath), { recursive: true });
  await writeFile(
    stateFilePath,
    JSON.stringify(
      {
        lastAutoCleanupAt: timestamp
      },
      null,
      2
    )
  );
}

async function removePathIfPresent(targetPath) {
  if (!(await pathExists(targetPath))) {
    return false;
  }

  await rm(targetPath, {
    recursive: true,
    force: true
  });
  return true;
}

export function getSourceDesktopLocalState(repoRoot) {
  return {
    profileDir: path.resolve(repoRoot, ".local", "interactive-search"),
    cleanupStateFilePath: path.resolve(repoRoot, ".local", "desktop-cleanup.json"),
    evidenceDir: path.resolve(repoRoot, "data", "evidence")
  };
}

export function getPackagedDesktopLocalState(userDataDir) {
  return {
    profileDir: path.resolve(userDataDir, "interactive-search"),
    cleanupStateFilePath: path.resolve(userDataDir, "desktop-cleanup.json"),
    evidenceDir: path.resolve(userDataDir, "evidence")
  };
}

export async function pruneInteractiveSearchCaches(input) {
  const logger = input.logger ?? console;
  const removedDirectories = [];
  let reclaimedBytes = 0;

  for (const relativeDir of PROFILE_CACHE_DIRECTORIES) {
    const absoluteDir = path.resolve(input.profileDir, relativeDir);
    if (!(await pathExists(absoluteDir))) {
      continue;
    }

    try {
      const details = await stat(absoluteDir);
      reclaimedBytes += details.isDirectory() ? details.size : 0;
    } catch {
      // Best-effort size accounting only.
    }

    const removed = await removePathIfPresent(absoluteDir);
    if (removed) {
      removedDirectories.push(relativeDir);
    }
  }

  if (removedDirectories.length > 0) {
    logger.log(
      `Pruned Scout interactive-search caches from ${input.profileDir} (${removedDirectories.length} directories).`
    );
  }

  return {
    removedDirectories,
    reclaimedBytes
  };
}

export async function maybeAutoCleanupInteractiveSearch(input) {
  const logger = input.logger ?? console;
  const now = input.now ?? new Date();
  const intervalMs = input.intervalMs ?? AUTO_CLEANUP_INTERVAL_MS;

  if (!(await pathExists(input.profileDir))) {
    return {
      skipped: true,
      reason: "profile_missing"
    };
  }

  const existingState = await readCleanupState(input.cleanupStateFilePath);
  if (existingState?.lastAutoCleanupAt) {
    const lastCleanupTime = Date.parse(existingState.lastAutoCleanupAt);
    if (Number.isFinite(lastCleanupTime) && now.getTime() - lastCleanupTime < intervalMs) {
      return {
        skipped: true,
        reason: "recently_cleaned"
      };
    }
  }

  const result = await pruneInteractiveSearchCaches({
    profileDir: input.profileDir,
    logger
  });

  await writeCleanupState(input.cleanupStateFilePath, now.toISOString());

  return {
    skipped: false,
    ...result
  };
}

export async function fullCleanupLocalState(input) {
  const logger = input.logger ?? console;
  const removed = [];

  for (const targetPath of [input.profileDir, input.evidenceDir, input.cleanupStateFilePath]) {
    const didRemove = await removePathIfPresent(targetPath);
    if (didRemove) {
      removed.push(targetPath);
    }
  }

  logger.log(
    removed.length > 0
      ? `Removed Scout local state:\n- ${removed.join("\n- ")}`
      : "No Scout local state paths were present to remove."
  );

  return {
    removed
  };
}
