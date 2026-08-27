import type { IpcMain } from "electron";
import { getSafeWordSyncStatus, loadSafeWordDictionary, saveSafeWordDictionary, syncSafeWordDictionary } from "../repository/content-safety-repository.js";

export function registerContentSafetyIpc(ipcMain: IpcMain, repositoryRoot: () => Promise<string>): void {
  ipcMain.handle("content-safety:dictionary:load", async () => loadSafeWordDictionary(await repositoryRoot()));
  ipcMain.handle("content-safety:dictionary:save", async (_event, value: unknown) => saveSafeWordDictionary(await repositoryRoot(), value));
  ipcMain.handle("content-safety:dictionary:sync-status", async () => getSafeWordSyncStatus(await repositoryRoot()));
  ipcMain.handle("content-safety:dictionary:sync", async () => syncSafeWordDictionary(await repositoryRoot()));
}
