import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const expectedPackages = [
  ["apps/webapp/package.json", "@scout/webapp"],
  ["apps/desktopapp/package.json", "@scout/desktopapp"],
  ["apps/mobileapp/package.json", "@scout/mobileapp"],
  ["packages/shared-types/package.json", "@scout/shared-types"],
  ["packages/domain/package.json", "@scout/domain"],
  ["packages/api-contracts/package.json", "@scout/api-contracts"],
  ["packages/validation/package.json", "@scout/validation"],
  ["packages/realtime/package.json", "@scout/realtime"],
  ["packages/auth/package.json", "@scout/auth"],
  ["packages/geo/package.json", "@scout/geo"],
  ["packages/privacy/package.json", "@scout/privacy"],
  ["packages/ui/package.json", "@scout/ui"],
  ["packages/config/package.json", "@scout/config"]
];

for (const [manifestPath, expectedName] of expectedPackages) {
  const fullPath = path.resolve(rootDir, manifestPath);
  const manifest = JSON.parse(readFileSync(fullPath, "utf8"));
  if (manifest.name !== expectedName) {
    throw new Error(`${manifestPath} should declare ${expectedName}.`);
  }
}

console.log(`Workspace package map is valid across ${expectedPackages.length} package manifests.`);
