import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { AppSettings } from "../core/models.js"
import { scanQuizRepository } from "../repositories/quiz-repository.js"
import { SettingsStore } from "./settings.js"

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const appIconPath = app.isPackaged
  ? path.join(currentDirectory, "../renderer/icons/getgo-icon-blue.png")
  : path.join(app.getAppPath(), "src/renderer/public/icons/getgo-icon-blue.png")
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    title: "GetGo Tools",
    icon: appIconPath,
    backgroundColor: "#f4f5f2",
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(path.join(currentDirectory, "../renderer/index.html"))
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath)
  const settings = new SettingsStore(app.getPath("userData"))
  ipcMain.handle("settings:get", () => settings.read())
  ipcMain.handle("repository:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openDirectory"] })
    if (result.canceled || !result.filePaths[0]) return null
    const snapshot = await scanQuizRepository(result.filePaths[0])
    await settings.update({ repositoryPath: snapshot.repositoryPath })
    return snapshot
  })
  ipcMain.handle("repository:scan", async (_event, requestedPath?: string) => {
    const current = await settings.read()
    const repositoryPath = requestedPath ?? current.repositoryPath
    if (!repositoryPath) throw new Error("Choose a quiz repository first.")
    const snapshot = await scanQuizRepository(repositoryPath)
    await settings.update({ repositoryPath: snapshot.repositoryPath })
    return snapshot
  })
  ipcMain.handle("settings:environment", (_event, environment: AppSettings["environment"]) => {
    if (!["development", "staging", "production"].includes(environment)) {
      throw new Error("Invalid environment")
    }
    return settings.update({ environment })
  })
  ipcMain.handle("shell:show", async (_event, filePath: string) => {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new Error("Invalid path")
    shell.showItemInFolder(filePath)
  })
  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
