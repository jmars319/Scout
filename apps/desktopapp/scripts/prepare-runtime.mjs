import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { build } from "esbuild";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(desktopDir, "../..");
const runtimeDir = path.resolve(desktopDir, ".desktop-runtime");
const webRuntimeStagingDir = path.resolve(runtimeDir, ".webapp-staging");
const webRuntimeDir = path.resolve(runtimeDir, "webapp");
const browserRuntimeDir = path.resolve(runtimeDir, "playwright");
const hashedPlaywrightPackageName = "playwright-f3e876efb1eb8da1";
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if ((code ?? 1) === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "null"}.`));
    });
  });
}

async function trimDeployedWebRuntime() {
  for (const relativePath of [
    ".next/cache",
    ".next/dev",
    ".next/types",
    "data/evidence",
    "data/runs",
    "node_modules/@scout/webapp",
    "node_modules/.pnpm/node_modules/@scout/webapp",
    "tsconfig.tsbuildinfo"
  ]) {
    await rm(path.resolve(webRuntimeDir, relativePath), {
      recursive: true,
      force: true
    });
  }
}

async function installBundledChromium() {
  await mkdir(browserRuntimeDir, {
    recursive: true
  });

  await run(pnpmBin, ["--dir", webRuntimeDir, "exec", "playwright", "install", "chromium"], {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: browserRuntimeDir
  });
}

async function bundleWorkerRuntime() {
  const workerOutfile = path.resolve(webRuntimeDir, "desktop", "worker.cjs");
  await mkdir(path.dirname(workerOutfile), {
    recursive: true
  });

  await build({
    absWorkingDir: repoRoot,
    bundle: true,
    entryPoints: [path.resolve(repoRoot, "apps/webapp/src/scripts/worker.ts")],
    external: ["playwright", "@axe-core/playwright"],
    format: "cjs",
    legalComments: "none",
    logLevel: "info",
    outfile: workerOutfile,
    platform: "node",
    target: "node20",
    tsconfig: path.resolve(repoRoot, "tsconfig.base.json")
  });
}

async function ensureTurbopackExternalAliases() {
  const packageDir = path.resolve(webRuntimeDir, "node_modules", hashedPlaywrightPackageName);
  await mkdir(packageDir, {
    recursive: true
  });

  await writeFile(
    path.resolve(packageDir, "package.json"),
    `${JSON.stringify(
      {
        name: hashedPlaywrightPackageName,
        private: true,
        main: "index.js"
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    path.resolve(packageDir, "index.js"),
    'module.exports = require("playwright");\n'
  );
}

async function writeRuntimeManifest() {
  await writeFile(
    path.resolve(runtimeDir, "manifest.json"),
    `${JSON.stringify(
      {
        webappRelativePath: "webapp",
        nextCliRelativePath: "webapp/node_modules/next/dist/bin/next",
        workerRelativePath: "webapp/desktop/worker.cjs",
        browsersRelativePath: "playwright"
      },
      null,
      2
    )}\n`
  );
}

console.log("Preparing Scout desktop runtime bundle...");
await rm(runtimeDir, {
  recursive: true,
  force: true
});
await mkdir(runtimeDir, {
  recursive: true
});

console.log("Building the web production assets...");
await run(pnpmBin, ["--filter", "@scout/webapp", "build"], {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1"
});

console.log("Deploying a self-contained webapp runtime...");
await run(pnpmBin, ["--filter", "@scout/webapp", "deploy", "--legacy", "--prod", webRuntimeStagingDir]);
await rename(webRuntimeStagingDir, webRuntimeDir);
await trimDeployedWebRuntime();
await ensureTurbopackExternalAliases();

console.log("Bundling the packaged worker runtime...");
await bundleWorkerRuntime();

console.log("Installing bundled Chromium for packaged Scout desktop...");
await installBundledChromium();

await writeRuntimeManifest();
console.log(`Scout desktop runtime bundle written to ${runtimeDir}.`);
