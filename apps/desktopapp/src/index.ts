import { APP_NAME } from "@scout/config";

export const desktopSurface = {
  appName: APP_NAME,
  active: true,
  runtime: "electron_shell",
  note: "Desktop is the primary Scout product surface. It wraps the shared local UI/runtime in Electron, starts the local worker automatically, and owns the operator workflow."
};
