import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { config as loadEnvironment } from "dotenv";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RepositoryRuntime } from "../../features/topics/main/repository-runtime.js";
import { loadQuizQuestions } from "../../features/quiz-editor/repository/quiz-questions.js";
import { createPublishPayloadFromQuestions, recordPublishedHash } from "../../features/topics/repository/quiz-publishing.js";
import { SettingsStore } from "../../features/settings/main/settings.js";
import { registerSettingsIpc } from "../../features/settings/main/settings-ipc.js";
import { FirebaseAuthService } from "../../features/authentication/main/firebase-auth.js";
import { LocalAiService } from "../../features/ai/main/local-ai.js";
import { AiMigrationJobManager } from "../../features/ai/main/ai-migration-jobs.js";
import { PublishJobManager } from "../../features/jobs/main/publish-jobs.js";
import { WebDeploymentJobManager } from "../../features/deployment/main/web-deployment-jobs.js";
import { LocalWebRuntimeManager } from "../../features/deployment/main/local-web-runtime.js";
import { registerBackgroundJobsIpc } from "../../features/jobs/main/background-jobs-ipc.js";
import { registerAiIpc } from "../../features/ai/main/ai-ipc.js";
import { registerImagePdfIpc } from "../../features/image-pdf/main/image-pdf-ipc.js";
import { registerAuthIpc } from "../../features/authentication/main/auth-ipc.js";
import { registerLegacyQuizIpc } from "../../features/topics/main/legacy-quiz-ipc.js";
import { registerTopicResourcesIpc } from "../../features/topics/main/topic-resources-ipc.js";
import { registerContentV2CrudIpc } from "../../features/topics/main/content-v2-crud-ipc.js";
import { registerContentV2PublishingIpc } from "../../features/topics/main/content-v2-publishing-ipc.js";
import { FirestorePublishingService } from "../../features/topics/main/firestore-publishing.js";

loadEnvironment({
  path: app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(app.getAppPath(), ".env"),
});

const productName = "GetGo Tools";
const processStartedAt = Date.now();
let startupLogFile: string | null = null;
const startupLog = (stage: string, details: Record<string, unknown> = {}) =>
  (() => {
    const elapsedMs = Date.now() - processStartedAt;
    console.info(`[GetGo Tools][Startup][+${elapsedMs}ms] ${stage}`, details);
    if (startupLogFile) {
      void fs
        .appendFile(
          startupLogFile,
          `${JSON.stringify({ product: productName, stage, elapsedMs, at: new Date().toISOString(), details })}\n`,
        )
        .catch(() => undefined);
    }
  })();
app.setName(productName);
process.title = productName;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = app.isPackaged
  ? path.join(currentDirectory, "../../renderer/icons/getgo-app-icon.png")
  : path.join(app.getAppPath(), "src/renderer/public/icons/getgo-app-icon.png");
let mainWindow: BrowserWindow | null = null;
let firebaseAuth: FirebaseAuthService | null = null;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

function createWindow(): void {
  startupLog("Creating main window");
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1000,
    minHeight: 680,
    title: productName,
    icon: appIconPath,
    show: true,
    backgroundColor: "#f4f5f2",
    webPreferences: {
      preload: path.join(currentDirectory, "../../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  mainWindow.webContents.once("did-finish-load", () => {
    startupLog("Renderer finished loading");
  });
  if (devUrl) void mainWindow.loadURL(devUrl);
  else
    void mainWindow.loadFile(
      path.join(currentDirectory, "../../renderer/index.html"),
    );
}

app.whenReady().then(async () => {
  const startupLogDirectory = path.join(
    app.getPath("userData"),
    "startup-logs",
  );
  await fs.mkdir(startupLogDirectory, { recursive: true });
  startupLogFile = path.join(
    startupLogDirectory,
    `startup-${new Date(processStartedAt).toISOString().replace(/[:.]/g, "-")}.jsonl`,
  );
  await fs.appendFile(
    startupLogFile,
    `${JSON.stringify({ product: productName, stage: "Process started", elapsedMs: 0, at: new Date(processStartedAt).toISOString(), details: { pid: process.pid, platform: process.platform, packaged: app.isPackaged, logFile: startupLogFile } })}\n`,
  );
  startupLog("Electron ready");
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);
  const settings = new SettingsStore(app.getPath("userData"));
  const repository = new RepositoryRuntime();
  let repositorySnapshot: Awaited<ReturnType<typeof repository.scan>> | null = null;
  const snapshotState = {
    get value() { return repositorySnapshot; },
    set value(value) { repositorySnapshot = value; },
  };
  const scanRepository = async (
    repositoryPath: string,
    options?: Parameters<typeof repository.scan>[1],
    force = false,
  ) => {
    repositorySnapshot = await repository.scan(repositoryPath, options, force);
    return repositorySnapshot;
  };
  const requireSnapshot = () => {
    if (!repositorySnapshot) {
      throw new Error(
        "Repository data is not loaded. Restart Tools or choose the repository again.",
      );
    }
    return repositorySnapshot;
  };
  const waitForSnapshot = async (repositoryPath: string) => {
    const resolved = path.resolve(repositoryPath);
    if (repositorySnapshot?.repositoryPath === resolved) return repositorySnapshot;
    repositorySnapshot = await repository.wait(resolved);
    return repositorySnapshot;
  };
  const replaceQuiz = async (root: string, manifestPath: string) => {
    repository.replace(requireSnapshot());
    repositorySnapshot = await repository.replaceQuiz(root, manifestPath);
    return repositorySnapshot;
  };
  const repositoryRoot = async (): Promise<string> => {
    const current = await settings.read();
    if (!current.repositoryPath)
      throw new Error("Choose a quiz repository first.");
    return current.repositoryPath;
  };
  const settingsStartedAt = Date.now();
  const initialSettings = await settings.read();
  startupLog("Settings loaded", {
    durationMs: Date.now() - settingsStartedAt,
    hasRepository: Boolean(initialSettings.repositoryPath),
  });
  // Register the boot-critical handlers before loading the renderer. The
  // remaining feature handlers can finish registering while the loading page
  // is already visible.
  ipcMain.handle("settings:get", () => settings.read());
  ipcMain.handle(
    "repository:scan",
    async (_event, requestedPath?: string, force = false) => {
      const current = await settings.read();
      const repositoryPath = requestedPath ?? current.repositoryPath;
      if (!repositoryPath) throw new Error("Choose a quiz repository first.");
      const snapshot = await scanRepository(repositoryPath, undefined, force);
      await settings.update({ repositoryPath: snapshot.repositoryPath });
      return snapshot;
    },
  );
  // Create the renderer before repository indexing so users see immediate
  // startup feedback instead of a blank window during the scan.
  createWindow();
  if (initialSettings.repositoryPath) {
    const startupScanStartedAt = Date.now();
    void scanRepository(initialSettings.repositoryPath, {
      inspectQuestionRecords: false,
      lightweight: true,
    })
      .then(() =>
        startupLog("Startup repository index ready", {
          durationMs: Date.now() - startupScanStartedAt,
        }),
      )
      .catch((cause) =>
        console.error(
          `[GetGo Tools][Repository startup scan] ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
      );
  }
  firebaseAuth = new FirebaseAuthService(
    app.getPath("userData"),
    async () => (await settings.read()).environment,
  );
  const publishing = new FirestorePublishingService(firebaseAuth);
  const localAi = new LocalAiService({
    apiKey: process.env.GETGO_AI_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    model: process.env.GETGO_AI_OPENAI_MODEL,
    profile: initialSettings.aiProfile,
  });
  const aiMigrationJobs = new AiMigrationJobManager(app.getPath("userData"), {
    apiKey: process.env.GETGO_AI_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY,
    model: process.env.GETGO_AI_OPENAI_MODEL,
    profile: initialSettings.aiProfile,
  });
  const publishJobs = new PublishJobManager(app.getPath("userData"));
  const webDeploymentJobs = new WebDeploymentJobManager(
    app.getPath("userData"),
    app.getAppPath(),
  );
  const localWebRuntime = new LocalWebRuntimeManager(
    app.getAppPath(),
    app.getPath("userData"),
  );
  startupLog("Background services initialized");
  ipcMain.handle("app:restart", () => {
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      mainWindow?.reload();
      return;
    }
    app.relaunch();
    app.exit(0);
  });
  registerImagePdfIpc(ipcMain);
  registerAuthIpc(ipcMain, firebaseAuth);
  registerAiIpc(ipcMain, localAi, aiMigrationJobs);
  const backgroundJobsSnapshot = registerBackgroundJobsIpc(
    ipcMain, aiMigrationJobs, publishJobs, webDeploymentJobs, localWebRuntime,
  );
  ipcMain.handle(
    "publishing:quiz",
    async (_event, contestId: unknown, quizId: unknown) => {
      if (
        typeof contestId !== "string" ||
        typeof quizId !== "string" ||
        !/^[a-z0-9_-]+$/i.test(contestId) ||
        !/^[a-z0-9_-]+$/i.test(quizId)
      )
        throw new Error("Invalid quiz selection.");
      const current = await settings.read();
      if (!current.repositoryPath)
        throw new Error("Choose a quiz repository first.");
      const snapshot = await waitForSnapshot(current.repositoryPath);
      const quiz = snapshot.quizzes.find(
        (item) => item.contest === contestId && item.id === quizId,
      );
      if (!quiz) throw new Error("The selected quiz was not found.");
      const records = await loadQuizQuestions(quiz.manifestPath);
      if (!records.length)
        throw new Error("This quiz has no question data to publish.");
      const contest = snapshot.contests.find((item) => item.id === contestId);
      const payload = createPublishPayloadFromQuestions(quiz, records, contest);
      return publishJobs.track(
        {
          name: `Publish · ${quiz.title}`,
          description: `Publish ${payload.quiz.questionCount} questions to Firebase`,
          route: `/quizzes/contests/${encodeURIComponent(contestId)}/quizzes/${encodeURIComponent(quizId)}?tab=publish`,
        },
        async (control) => {
          const result = await publishing.publish(quiz, payload, control);
          await recordPublishedHash(
            quiz.manifestPath,
            result.contentHash,
            result.publishedAt,
          );
          if (repositorySnapshot)
            repositorySnapshot = {
              ...repositorySnapshot,
              quizzes: repositorySnapshot.quizzes.map((item) =>
                item.key === quiz.key
                  ? {
                      ...item,
                      publishedHash: result.contentHash,
                      publishedAt: result.publishedAt,
                    }
                  : item,
              ),
            };
          return result;
        },
      );
    },
  );
  ipcMain.handle("repository:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const snapshot = await scanRepository(result.filePaths[0]);
    await settings.update({ repositoryPath: snapshot.repositoryPath });
    return snapshot;
  });
  registerTopicResourcesIpc(ipcMain, { mainWindow: mainWindow!, snapshotState, requireSnapshot, repositoryRoot, publishing, publishJobs, backgroundJobsSnapshot, firebaseAuth });
  registerContentV2CrudIpc(ipcMain, { snapshotState, requireSnapshot, repositoryRoot });
  registerContentV2PublishingIpc(ipcMain, { snapshotState, requireSnapshot, repositoryRoot, publishing, publishJobs, firebaseAuth });
  registerSettingsIpc(ipcMain, settings, localAi, aiMigrationJobs);
  registerLegacyQuizIpc(ipcMain, { settings, snapshotState, requireSnapshot, replaceQuiz });
  startupLog("IPC handlers registered");
  startupLog("Startup complete", { logFile: startupLogFile });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
