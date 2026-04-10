import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

mkdirSync(path.resolve(rootDir, "data/evidence"), { recursive: true });
mkdirSync(path.resolve(rootDir, "data/runs"), { recursive: true });

run(pnpmBin, ["install"]);
run(pnpmBin, ["--filter", "@scout/webapp", "exec", "playwright", "install", "chromium"]);
