import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import {
  appName,
  findInstalledAppBundle,
  getInstalledAppPath,
  installPackagedApp,
  userApplicationsDirPath
} from "./lib/launcher.mjs";

const execFileAsync = promisify(execFile);
const skipInstall = process.argv.includes("--skip-install");
const RUNTIME_VERIFY_TIMEOUT_MS = 90_000;

function executablePathForApp(appBundlePath) {
  return path.resolve(appBundlePath, "Contents", "MacOS", appName);
}

async function assertPathAccess(filePath, label, mode = constants.R_OK) {
  await access(filePath, mode).catch((error) => {
    throw new Error(`${label} is not readable at ${filePath}: ${error.message}`);
  });
}

async function verifyCodeSignature(appBundlePath) {
  await execFileAsync("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appBundlePath
  ]);
}

async function verifyPackagedRuntime(executablePath) {
  await assertPathAccess(
    executablePath,
    "Packaged Scout executable",
    constants.R_OK | constants.X_OK
  );

  await new Promise((resolve, reject) => {
    const child = spawn(executablePath, [], {
      env: {
        ...process.env,
        SCOUT_DESKTOP_APP_NAME: appName,
        SCOUT_DESKTOP_RUNTIME_VERIFY: "1"
      },
      stdio: "inherit"
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Packaged Scout runtime verification timed out."));
    }, RUNTIME_VERIFY_TIMEOUT_MS);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);

      if ((code ?? 1) === 0) {
        resolve();
        return;
      }

      reject(new Error(`Packaged Scout runtime verification exited with code ${code ?? "null"}.`));
    });
  });
}

const installResult = skipInstall
  ? {
      targetAppPath:
        (await findInstalledAppBundle(appName)) ?? getInstalledAppPath(userApplicationsDirPath, appName),
      envFilePath: path.resolve(
        process.env.HOME ?? "",
        "Library",
        "Application Support",
        appName,
        ".env"
      ),
      createdEnvFile: false
    }
  : await installPackagedApp({
      installDirPath: userApplicationsDirPath
    });

await assertPathAccess(installResult.targetAppPath, "Installed Scout app bundle");
const envFile = await readFile(installResult.envFilePath, "utf8");

if (!envFile.includes("DATABASE_URL=postgresql:///scout")) {
  throw new Error(
    `Scout desktop env file does not include the default local DATABASE_URL: ${installResult.envFilePath}`
  );
}

await verifyCodeSignature(installResult.targetAppPath);
await verifyPackagedRuntime(executablePathForApp(installResult.targetAppPath));

console.log(`Packaged desktop install QA passed for ${installResult.targetAppPath}.`);
console.log(`Scout desktop env file: ${installResult.envFilePath}.`);
