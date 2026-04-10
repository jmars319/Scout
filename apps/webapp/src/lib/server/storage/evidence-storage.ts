import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEvidenceStorageConfig } from "@scout/config";
import { buildEvidenceUrlPath } from "@scout/privacy";

export interface StoredEvidence {
  relativePath: string;
  absolutePath: string;
  publicUrl: string;
}

export interface EvidenceStorage {
  saveScreenshot: (relativePath: string, buffer: Buffer) => Promise<StoredEvidence>;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");

function resolveEvidenceDirPath(configuredPath: string): string {
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(repoRoot, configuredPath);
}

export function getEvidenceBaseDir(): string {
  const config = getEvidenceStorageConfig();
  return resolveEvidenceDirPath(config.localDir);
}

export function createEvidenceStorage(): EvidenceStorage {
  const config = getEvidenceStorageConfig();

  if (config.driver !== "local") {
    throw new Error("Only local evidence storage is implemented in Scout v1.");
  }

  const baseDir = resolveEvidenceDirPath(config.localDir);

  return {
    async saveScreenshot(relativePath: string, buffer: Buffer) {
      const absolutePath = path.resolve(baseDir, relativePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, buffer);

      return {
        relativePath,
        absolutePath,
        publicUrl: buildEvidenceUrlPath(relativePath)
      };
    }
  };
}
