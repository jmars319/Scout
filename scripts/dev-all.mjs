import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const children = [
  spawn(pnpmBin, ["run", "dev:web"], {
    cwd: rootDir,
    stdio: "inherit"
  }),
  spawn(pnpmBin, ["run", "dev:worker"], {
    cwd: rootDir,
    stdio: "inherit"
  })
];

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code) => {
    shutdown(code ?? 0);
  });
}
