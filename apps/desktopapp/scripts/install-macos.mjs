import {
  appName,
  installPackagedApp,
  openMacApp,
  revealMacApp,
  systemApplicationsDirPath,
  userApplicationsDirPath
} from "./lib/launcher.mjs";

const useUserInstall = process.argv.includes("--user");
const revealOnly = process.argv.includes("--reveal");
const noOpen = process.argv.includes("--no-open");

const installDirPath = useUserInstall ? userApplicationsDirPath : systemApplicationsDirPath;
const result = await installPackagedApp({
  installDirPath
});

console.log(`Installed ${appName} to ${result.targetAppPath}.`);
console.log(`Scout desktop env file: ${result.envFilePath}`);

if (result.createdEnvFile) {
  console.log(
    "Seeded a default local env file with DATABASE_URL=postgresql:///scout for packaged desktop launch."
  );
}

if (revealOnly) {
  await revealMacApp(result.targetAppPath);
} else if (!noOpen) {
  await openMacApp(result.targetAppPath);
}
