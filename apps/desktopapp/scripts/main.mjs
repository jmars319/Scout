import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { app, BrowserWindow, dialog, shell } = require("electron/main");

import {
  createManagedProcess,
  ensureDesktopDatabaseUrl,
  getAvailablePort,
  loadEnvFiles,
  stopManagedProcess,
  waitForServerReady
} from "./lib/runtime.mjs";
import { ensurePackagedUserEnvFile } from "./lib/launcher.mjs";
import {
  getPackagedDesktopLocalState,
  maybeAutoCleanupInteractiveSearch
} from "./lib/local-state.mjs";

const appName = process.env.SCOUT_DESKTOP_APP_NAME || "Scout by JAMARQ";
const verifyMode =
  process.argv.includes("--verify") || process.env.SCOUT_DESKTOP_VERIFY === "1";
let targetUrl = process.env.SCOUT_DESKTOP_URL;
let runtimeRef = null;
let shuttingDown = false;

app.setName(appName);

function isInternalUrl(url) {
  if (!targetUrl) {
    return false;
  }

  try {
    const target = new URL(targetUrl);
    const current = new URL(url);
    return current.origin === target.origin;
  } catch {
    return false;
  }
}

async function readRuntimeManifest() {
  const manifestPath = path.resolve(process.resourcesPath, "desktop-runtime", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  return {
    webappDirPath: path.resolve(process.resourcesPath, "desktop-runtime", manifest.webappRelativePath),
    nextCliPath: path.resolve(process.resourcesPath, "desktop-runtime", manifest.nextCliRelativePath),
    workerEntryPath: path.resolve(process.resourcesPath, "desktop-runtime", manifest.workerRelativePath),
    browsersDirPath: path.resolve(process.resourcesPath, "desktop-runtime", manifest.browsersRelativePath)
  };
}

function getPackagedNodeHostPath() {
  const helperExecutablePath = path.resolve(
    path.dirname(process.execPath),
    "..",
    "Frameworks",
    `${appName} Helper.app`,
    "Contents",
    "MacOS",
    `${appName} Helper`
  );

  if (existsSync(helperExecutablePath)) {
    return helperExecutablePath;
  }

  return process.execPath;
}

async function shutdownRuntime() {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await stopManagedProcess(runtimeRef?.workerProcess).catch(() => {});
  await stopManagedProcess(runtimeRef?.webProcess).catch(() => {});
}

async function startPackagedRuntime() {
  const userDataDir = app.getPath("userData");
  const localState = getPackagedDesktopLocalState(userDataDir);
  await ensurePackagedUserEnvFile({
    name: appName,
    userDataDirPath: userDataDir
  });
  loadEnvFiles([
    path.resolve(process.resourcesPath, "scout.env"),
    path.resolve(userDataDir, ".env")
  ]);
  ensureDesktopDatabaseUrl(console);

  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const manifest = await readRuntimeManifest();
  const nodeHostPath = getPackagedNodeHostPath();
  const cleanupResult = await maybeAutoCleanupInteractiveSearch({
    profileDir: localState.profileDir,
    cleanupStateFilePath: localState.cleanupStateFilePath,
    logger: console
  });
  const nodeEnv = {
    ...process.env,
    APP_NAME: appName,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_URL: baseUrl,
    SCOUT_DESKTOP_APP_NAME: appName,
    SCOUT_DESKTOP_URL: baseUrl,
    SCOUT_INTERACTIVE_SEARCH: "1",
    SCOUT_INTERACTIVE_SEARCH_PROFILE_DIR: localState.profileDir,
    SCOUT_RUNTIME_ROOT: manifest.webappDirPath,
    EVIDENCE_LOCAL_DIR: localState.evidenceDir,
    PLAYWRIGHT_BROWSERS_PATH: manifest.browsersDirPath,
    ELECTRON_RUN_AS_NODE: "1"
  };

  if (!cleanupResult.skipped && cleanupResult.removedDirectories.length > 0) {
    console.log(
      `Scout desktop auto-cleaned ${cleanupResult.removedDirectories.length} interactive-search cache directories.`
    );
  }

  const webProcess = createManagedProcess(
    "web",
    nodeHostPath,
    [
      "--no-warnings",
      manifest.nextCliPath,
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port)
    ],
    {
      ...nodeEnv,
      ELECTRON_RUN_AS_NODE: "1"
    },
    {
      cwd: manifest.webappDirPath
    }
  );
  const workerProcess = createManagedProcess(
    "worker",
    nodeHostPath,
    ["--no-warnings", manifest.workerEntryPath],
    {
      ...nodeEnv,
      ELECTRON_RUN_AS_NODE: "1"
    },
    {
      cwd: manifest.webappDirPath
    }
  );

  await waitForServerReady(baseUrl, webProcess);

  return {
    baseUrl,
    webProcess,
    workerProcess
  };
}

function attachRuntimeExitHandlers() {
  for (const [name, processRef] of [
    ["Scout desktop web runtime", runtimeRef?.webProcess],
    ["Scout desktop worker runtime", runtimeRef?.workerProcess]
  ]) {
    processRef?.child.on("exit", (code) => {
      if (shuttingDown) {
        return;
      }

      dialog.showErrorBox(
        "Scout desktop stopped",
        `${name} exited unexpectedly with code ${code ?? "null"}.`
      );
      void shutdownRuntime().finally(() => {
        app.exit(code ?? 1);
      });
    });
  }
}

function createWindow() {
  if (!targetUrl) {
    throw new Error("SCOUT_DESKTOP_URL is required to launch Scout desktop.");
  }

  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    title: appName,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return {
      action: "deny"
    };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) {
      return;
    }

    event.preventDefault();
    void shell.openExternal(url);
  });

  void window.loadURL(targetUrl);
}

app.whenReady().then(async () => {
  if (verifyMode) {
    console.log("Scout desktop runtime verified.");
    app.quit();
    return;
  }

  try {
    if (app.isPackaged) {
      runtimeRef = await startPackagedRuntime();
      targetUrl = runtimeRef.baseUrl;
      attachRuntimeExitHandlers();
    }

    createWindow();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Scout desktop startup failure.";
    dialog.showErrorBox("Scout desktop failed to start", message);
    await shutdownRuntime();
    app.exit(1);
  }
});

app.on("before-quit", (event) => {
  if (!runtimeRef || shuttingDown) {
    return;
  }

  event.preventDefault();
  void shutdownRuntime().finally(() => {
    app.exit(0);
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
