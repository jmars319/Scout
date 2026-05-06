import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fixtureDir = path.resolve("fixtures/handoffs");
const registryDocCheck = spawnSync(process.execPath, ["scripts/generate-handoff-registry.mjs", "--check"], {
  stdio: "inherit"
});
if (registryDocCheck.status !== 0) process.exit(registryDocCheck.status ?? 1);
const expectedSchemas = new Set(["tenra-scout.opportunity-handoff.v1"]);

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listJsonFiles(fullPath) : entry.name.endsWith(".json") ? [fullPath] : [];
  });
}

const files = listJsonFiles(fixtureDir);
if (files.length === 0) throw new Error("No handoff fixtures found.");

for (const file of files) {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!payload || typeof payload !== "object" || typeof payload.schema !== "string") {
    throw new Error(`${file} must contain an object payload with a schema string.`);
  }
  if (!expectedSchemas.has(payload.schema)) {
    throw new Error(`${file} uses an unexpected schema: ${payload.schema}`);
  }
  if (payload.proxyShapeRequest?.profileId !== "profile:default") {
    throw new Error(`${file} must include a default Proxy profile request.`);
  }
  if (!payload.recommendedNextApps?.includes("assembly") || !payload.recommendedNextApps?.includes("proxy")) {
    throw new Error(`${file} must keep Assembly and Proxy as recommended next apps.`);
  }
}

console.log(`Validated ${files.length} Scout handoff fixture(s).`);
