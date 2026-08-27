import type { IpcMain } from "electron";
import { loadSafeWordDictionary, saveSafeWordDictionary } from "../repository/content-safety-repository.js";

export function registerContentSafetyIpc(ipcMain: IpcMain, repositoryRoot: () => Promise<string>): void {
  ipcMain.handle("content-safety:dictionary:load", async () => loadSafeWordDictionary(await repositoryRoot()));
  ipcMain.handle("content-safety:dictionary:save", async (_event, value: unknown) => saveSafeWordDictionary(await repositoryRoot(), value));
}
