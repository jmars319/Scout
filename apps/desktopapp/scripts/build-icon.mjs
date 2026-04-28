import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.resolve(desktopDir, "build");
const iconsetDir = path.resolve(buildDir, "Scout.iconset");
const sourcePngPath = path.resolve(buildDir, "icon-1024.png");
const icnsPath = path.resolve(buildDir, "icon.icns");
const swiftScriptPath = path.resolve(desktopDir, "scripts", "build-icon.swift");

const iconOutputs = [
  ["icon_16x16.png", 16],
  ["icon_16x16@2x.png", 32],
  ["icon_32x32.png", 32],
  ["icon_32x32@2x.png", 64],
  ["icon_128x128.png", 128],
  ["icon_128x128@2x.png", 256],
  ["icon_256x256.png", 256],
  ["icon_256x256@2x.png", 512],
  ["icon_512x512.png", 512],
  ["icon_512x512@2x.png", 1024]
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: desktopDir,
      env: process.env,
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

if (process.platform !== "darwin") {
  console.log("Skipping Scout macOS icon build because this host is not macOS.");
  process.exit(0);
}

await rm(buildDir, {
  recursive: true,
  force: true
});
await mkdir(iconsetDir, {
  recursive: true
});

console.log("Rendering Scout desktop icon...");
await run("/usr/bin/swift", [swiftScriptPath, sourcePngPath]);

for (const [fileName, size] of iconOutputs) {
  await run("/usr/bin/sips", [
    "-z",
    String(size),
    String(size),
    sourcePngPath,
    "--out",
    path.resolve(iconsetDir, fileName)
  ]);
}

await run("/usr/bin/iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath]);
console.log(`Scout desktop icon written to ${icnsPath}.`);

