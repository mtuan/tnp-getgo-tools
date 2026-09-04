import { dialog, type BrowserWindow, type IpcMain } from "electron";
import path from "node:path";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import { loadAvatarSetLibrary, syncAvatarSetLibrary } from "./avatar-set-service.js";

export function registerAvatarSetIpc(
  ipcMain: IpcMain,
  dependencies: { mainWindow: BrowserWindow; appPath: string; firebase: FirebaseAuthService },
): void {
  const defaultPath = path.resolve(dependencies.appPath, "../tmp/avatars");
  ipcMain.handle("avatar-sets:choose", async () => {
    const result = await dialog.showOpenDialog(dependencies.mainWindow, {
      title: "Choose avatar sets folder",
      defaultPath,
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle("avatar-sets:load", async (_event, requestedPath: unknown) =>
    loadAvatarSetLibrary(typeof requestedPath === "string" && requestedPath.trim() ? requestedPath : defaultPath));
  ipcMain.handle("avatar-sets:sync", async (_event, requestedPath: unknown) => {
    const library = await loadAvatarSetLibrary(
      typeof requestedPath === "string" && requestedPath.trim() ? requestedPath : defaultPath,
    );
    return syncAvatarSetLibrary(library, dependencies.firebase);
  });
}
