import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function getRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

export function loadWorkspaceEnv(): void {
  if (typeof process.loadEnvFile !== "function") {
    return;
  }

  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.resolve(getRepoRoot(), fileName);

    if (existsSync(filePath)) {
      process.loadEnvFile(filePath);
    }
  }
}
