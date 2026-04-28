import {
  appName,
  ensurePackagedUserEnvFile,
  findInstalledAppBundle,
  findPackagedAppBundle,
  openMacApp
} from "./lib/launcher.mjs";

await ensurePackagedUserEnvFile();

const appBundlePath = (await findInstalledAppBundle(appName)) ?? (await findPackagedAppBundle(appName));

if (!appBundlePath) {
  throw new Error(
    "Scout desktop launcher could not find an installed or packaged app bundle. Run `pnpm run install:desktop` first."
  );
}

console.log(`Launching ${appName} from ${appBundlePath}.`);
await openMacApp(appBundlePath);

