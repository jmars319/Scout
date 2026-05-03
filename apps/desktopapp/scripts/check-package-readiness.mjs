import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = path.join(desktopDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const buildConfig = packageJson.build ?? {};
const macConfig = buildConfig.mac ?? {};
const runtimeScript = readFileSync(path.join(desktopDir, "scripts/lib/runtime.mjs"), "utf8");
const launcherScript = readFileSync(path.join(desktopDir, "scripts/lib/launcher.mjs"), "utf8");

function fail(message) {
  throw new Error(`Scout desktop package readiness failed: ${message}`);
}

function requireFile(relativePath) {
  if (!existsSync(path.join(desktopDir, relativePath))) {
    fail(`Missing ${relativePath}.`);
  }
}

function requireArrayIncludes(value, expected, label) {
  if (!Array.isArray(value) || !value.includes(expected)) {
    fail(`${label} must include ${expected}.`);
  }
}

if (packageJson.main !== "./scripts/main.mjs") {
  fail("package.json main must point at ./scripts/main.mjs.");
}

if (buildConfig.appId !== "co.jamarq.scout.desktop") {
  fail("Electron Builder appId is not the expected Scout bundle identifier.");
}

if (buildConfig.productName !== "Scout by JAMARQ") {
  fail("Electron Builder productName is not Scout by JAMARQ.");
}

if (buildConfig.asar !== true) {
  fail("Electron Builder should package app code with asar enabled.");
}

requireArrayIncludes(buildConfig.files, "scripts/**/*", "Electron Builder files");
requireArrayIncludes(macConfig.target, "dir", "mac targets");
requireArrayIncludes(macConfig.target, "dmg", "mac targets");
requireArrayIncludes(macConfig.target, "zip", "mac targets");

const desktopRuntimeResource = Array.isArray(buildConfig.extraResources)
  ? buildConfig.extraResources.find(
      (resource) => resource.from === ".desktop-runtime" && resource.to === "desktop-runtime"
    )
  : undefined;

if (!desktopRuntimeResource) {
  fail("Electron Builder extraResources must bundle .desktop-runtime as desktop-runtime.");
}

if (!runtimeScript.includes('defaultDesktopDatabaseUrl = "postgresql:///scout"')) {
  fail("Desktop runtime must define Scout's default local database URL.");
}

if (!launcherScript.includes("DATABASE_URL=postgresql:///scout")) {
  fail("Packaged env template must seed DATABASE_URL=postgresql:///scout.");
}

for (const relativePath of [
  "scripts/main.mjs",
  "scripts/prepare-runtime.mjs",
  "scripts/check-release-env.mjs",
  "scripts/lib/runtime.mjs",
  "scripts/lib/launcher.mjs",
  "scripts/lib/local-state.mjs"
]) {
  requireFile(relativePath);
}

console.log("Scout desktop package readiness checks passed.");
