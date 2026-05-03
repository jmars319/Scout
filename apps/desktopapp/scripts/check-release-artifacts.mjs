import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { findPackagedAppBundle } from "./lib/launcher.mjs";

const execFileAsync = promisify(execFile);

async function run(command, args) {
  try {
    const result = await execFileAsync(command, args);
    return `${result.stdout}${result.stderr}`;
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed.${output ? `\n${output}` : ""}`);
  }
}

if (process.platform !== "darwin") {
  throw new Error("Scout desktop release artifact checks must run on macOS.");
}

const appBundlePath = await findPackagedAppBundle();

if (!appBundlePath) {
  throw new Error("Scout release artifact check could not find a packaged app under dist/desktop.");
}

await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundlePath]);
const signingDetail = await run("codesign", ["-dv", "--verbose=4", appBundlePath]);

if (!signingDetail.includes("Authority=Developer ID Application")) {
  throw new Error("Packaged Scout app is not signed with a Developer ID Application identity.");
}

await run("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundlePath]);

console.log(`Scout desktop release artifact checks passed for ${appBundlePath}.`);
