import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function hasValue(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function allSet(names) {
  return names.every(hasValue);
}

function describeSet(names) {
  return names.map((name) => `\`${name}\``).join(", ");
}

async function getCodeSigningIdentities() {
  if (process.platform !== "darwin") {
    return "";
  }

  try {
    const { stdout } = await execFileAsync("security", [
      "find-identity",
      "-v",
      "-p",
      "codesigning"
    ]);
    return stdout;
  } catch {
    return "";
  }
}

const codeSigningIdentities = await getCodeSigningIdentities();

function hasDeveloperIdIdentity() {
  return codeSigningIdentities.includes("Developer ID Application");
}

function getConfiguredCscNameIdentity() {
  if (!hasValue("CSC_NAME")) {
    return null;
  }

  const cscName = process.env.CSC_NAME.trim();
  return (
    codeSigningIdentities
      .split("\n")
      .find((line) => line.includes(cscName)) ?? null
  );
}

function hasConfiguredDeveloperIdCscName() {
  return getConfiguredCscNameIdentity()?.includes("Developer ID Application") ?? false;
}

const notarizationCredentialSets = [
  ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"],
  ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  ["APPLE_KEYCHAIN_PROFILE"]
];

const hasNotarizationCredentials = notarizationCredentialSets.some(allSet);
const hasExplicitSigningIdentity = hasValue("CSC_LINK") || hasConfiguredDeveloperIdCscName();
const hasKeychainSigningIdentity = hasDeveloperIdIdentity();

const errors = [];

if (process.platform !== "darwin") {
  errors.push("macOS release packaging must run on macOS so codesign and notarytool are available.");
}

if (hasValue("CSC_NAME") && !getConfiguredCscNameIdentity()) {
  errors.push("`CSC_NAME` is set, but it does not match an installed code-signing identity.");
}

if (hasValue("CSC_NAME") && getConfiguredCscNameIdentity() && !hasConfiguredDeveloperIdCscName()) {
  errors.push("`CSC_NAME` is set, but it is not a `Developer ID Application` identity.");
}

if (!hasExplicitSigningIdentity && !hasKeychainSigningIdentity) {
  errors.push(
    "Developer ID signing is not configured. Set `CSC_LINK` or `CSC_NAME`, or install a `Developer ID Application` certificate in the keychain."
  );
}

if (!hasNotarizationCredentials) {
  errors.push(
    `Notarization credentials are not configured. Set one of: ${notarizationCredentialSets
      .map(describeSet)
      .join(" | ")}.`
  );
}

if (errors.length > 0) {
  throw new Error(`Scout desktop release environment is incomplete:\n- ${errors.join("\n- ")}`);
}

console.log("Scout desktop release signing and notarization environment is ready.");
