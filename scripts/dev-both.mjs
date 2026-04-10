import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

console.log("Desktop and mobile are scaffold-only in Scout v1.");
console.log("dev:both currently runs the active web product surface.");

const child = spawn(pnpmBin, ["run", "dev:web"], {
  cwd: rootDir,
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
