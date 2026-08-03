import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron"
import { config as loadEnvironment } from "dotenv"
import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { AppSettings } from "../core/models.js"
import { scanQuizRepository } from "../repositories/quiz-repository.js"
import { createContestDirectory, createQuizFiles, renameContestDirectory, updateContestSettings, updateQuizManifest, updateQuizSource, validateRepositoryId } from "../repositories/quiz-crud.js"
import { loadQuizQuestions, saveQuizQuestion } from "../repositories/quiz-questions.js"
import { SettingsStore } from "./settings.js"
import { FirebaseAuthService } from "./firebase-auth.js"
import { LocalAiService } from "./local-ai.js"

loadEnvironment({ path: app.isPackaged ? path.join(process.resourcesPath, ".env") : path.join(app.getAppPath(), ".env") })

const productName = "GetGo Tools"
app.setName(productName)
process.title = productName

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const appIconPath = app.isPackaged
  ? path.join(currentDirectory, "../renderer/icons/getgo-app-icon.png")
  : path.join(app.getAppPath(), "src/renderer/public/icons/getgo-app-icon.png")
let mainWindow: BrowserWindow | null = null
let firebaseAuth: FirebaseAuthService | null = null
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()
else app.on("second-instance", () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    title: productName,
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
  firebaseAuth = new FirebaseAuthService(app.getPath("userData"), async () => (await settings.read()).environment)
  const localAi = new LocalAiService({
    apiKey: process.env.GETGO_AI_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    model: process.env.GETGO_AI_OPENAI_MODEL,
  })
  ipcMain.handle("auth:state", () => firebaseAuth!.state())
  ipcMain.handle("environment:readiness", () => firebaseAuth!.checkReadiness())
  ipcMain.handle("auth:sign-in", (_event, email: unknown, password: unknown) => {
    if (typeof email !== "string" || typeof password !== "string" || !email.includes("@") || password.length < 1) throw new Error("Enter a valid email and password.")
    return firebaseAuth!.signIn(email.trim(), password)
  })
  ipcMain.handle("auth:sign-out", () => firebaseAuth!.signOut())
  ipcMain.handle("auth:change-password", (_event, password: unknown) => {
    if (typeof password !== "string" || password.length < 8 || password.length > 256) throw new Error("Password must contain at least 8 characters.")
    return firebaseAuth!.changePassword(password)
  })
  ipcMain.handle("auth:provider", (_event, provider: unknown) => {
    if (!(["google", "facebook", "apple"] as unknown[]).includes(provider)) throw new Error("Unsupported sign-in provider.")
    return firebaseAuth!.signInWithProvider(provider as "google" | "facebook" | "apple")
  })
  ipcMain.handle("ai:dynamic-question", (_event, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid AI request.")
    const value = input as Record<string, unknown>
    if (!value.question || typeof value.question !== "object" || Array.isArray(value.question)) throw new Error("A local question record is required.")
    if (value.instructions !== undefined && typeof value.instructions !== "string") throw new Error("AI instructions must be text.")
    return localAi.createDynamicQuestionProposal(value as { question: import("../core/models.js").QuizQuestionRecord; instructions?: string })
  })
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
  ipcMain.handle("clipboard:write", (_event, text: unknown) => {
    if (typeof text !== "string" || text.length > 2048) throw new Error("Invalid clipboard text")
    clipboard.writeText(text)
  })
  ipcMain.handle("shell:open-external", async (_event, requestedUrl: unknown) => {
    if (typeof requestedUrl !== "string") throw new Error("Invalid URL")
    const url = new URL(requestedUrl)
    if (url.protocol !== "https:" || url.hostname !== "tnp-getgo.web.app") throw new Error("External URL is not allowed")
    await shell.openExternal(url.toString())
  })
  const resolveQuizSource = async (manifestPath: unknown): Promise<string> => {
    if (typeof manifestPath !== "string" || !path.isAbsolute(manifestPath) || path.basename(manifestPath) !== "manifest.json") {
      throw new Error("Invalid quiz manifest path")
    }
    const current = await settings.read()
    if (!current.repositoryPath) throw new Error("Choose a quiz repository first.")
    const relative = path.relative(current.repositoryPath, manifestPath)
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Quiz is outside the selected repository")
    return path.join(path.dirname(manifestPath), "quiz.ts")
  }
  const repositoryRoot = async (): Promise<string> => {
    const current = await settings.read()
    if (!current.repositoryPath) throw new Error("Choose a quiz repository first.")
    return current.repositoryPath
  }
  const resolveManifest = async (manifestPath: unknown): Promise<string> => {
    await resolveQuizSource(manifestPath)
    return manifestPath as string
  }
  ipcMain.handle("quiz-source:read", async (_event, manifestPath: unknown) => {
    return fs.readFile(await resolveQuizSource(manifestPath), "utf8")
  })
  ipcMain.handle("quiz-source:save", async (_event, manifestPath: unknown, source: unknown) => {
    if (typeof source !== "string") throw new Error("Invalid quiz source")
    await resolveQuizSource(manifestPath)
    await updateQuizSource(manifestPath as string, source)
  })
  ipcMain.handle("quiz-questions:load", async (_event, manifestPath: unknown) => {
    const manifest = await resolveManifest(manifestPath)
    return loadQuizQuestions(manifest)
  })
  ipcMain.handle("quiz-questions:save", async (_event, manifestPath: unknown, question: unknown) => {
    const manifest = await resolveManifest(manifestPath)
    if (!question || typeof question !== "object") throw new Error("Invalid question")
    return saveQuizQuestion(manifest, question as Parameters<typeof saveQuizQuestion>[1])
  })
  ipcMain.handle("crud:contest:create", async (_event, contestSettings: unknown) => {
    if (!contestSettings || typeof contestSettings !== "object") throw new Error("Invalid contest settings")
    const root = await repositoryRoot()
    await createContestDirectory(root, contestSettings as Parameters<typeof createContestDirectory>[1])
    return scanQuizRepository(root)
  })
  ipcMain.handle("crud:contest:update", async (_event, id: unknown, contestSettings: unknown) => {
    if (typeof id !== "string" || !contestSettings || typeof contestSettings !== "object") throw new Error("Invalid contest settings")
    const root = await repositoryRoot()
    await updateContestSettings(root, id, contestSettings as Parameters<typeof updateContestSettings>[2])
    return scanQuizRepository(root)
  })
  ipcMain.handle("crud:contest:rename", async (_event, currentId: unknown, nextId: unknown) => {
    if (typeof currentId !== "string" || typeof nextId !== "string") throw new Error("Invalid contest ID")
    const root = await repositoryRoot()
    await renameContestDirectory(root, currentId, nextId)
    return scanQuizRepository(root)
  })
  ipcMain.handle("crud:contest:delete", async (_event, requestedId: unknown) => {
    if (typeof requestedId !== "string") throw new Error("Invalid contest ID")
    const root = await repositoryRoot()
    const id = validateRepositoryId(requestedId, "Contest ID")
    const directory = path.join(root, "quizzes", id)
    await fs.access(directory)
    await shell.trashItem(directory)
    return scanQuizRepository(root)
  })
  ipcMain.handle("crud:quiz:create", async (_event, contest: unknown, input: unknown) => {
    if (typeof contest !== "string" || !input || typeof input !== "object") throw new Error("Invalid quiz details")
    const root = await repositoryRoot()
    await createQuizFiles(root, contest, input as Parameters<typeof createQuizFiles>[2])
    return scanQuizRepository(root)
  })
  ipcMain.handle("crud:quiz:update", async (_event, manifestPath: unknown, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid quiz details")
    const manifest = await resolveManifest(manifestPath)
    await updateQuizManifest(manifest, input as Parameters<typeof updateQuizManifest>[1])
    return scanQuizRepository(await repositoryRoot())
  })
  ipcMain.handle("crud:quiz:delete", async (_event, manifestPath: unknown) => {
    const manifest = await resolveManifest(manifestPath)
    await shell.trashItem(path.dirname(manifest))
    return scanQuizRepository(await repositoryRoot())
  })
  createWindow()
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit() })
