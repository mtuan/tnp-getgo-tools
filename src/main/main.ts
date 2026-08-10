import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from "electron";
import { config as loadEnvironment } from "dotenv";
import { watch, type FSWatcher } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, ImagePdfInput, ImagePdfSelection, RepositorySnapshot } from "../core/models.js";
import {
  hashContentV2,
  sanitizeContentV2Question,
  sanitizeContentV2Topic,
} from "../core/content-v2.js";
import {
  readContestSummary,
  readQuizSummary,
  scanQuizRepository,
} from "../repositories/quiz-repository.js";
import {
  createContestDirectory,
  createQuizFiles,
  renameContestDirectory,
  updateContestSettings,
  updateQuizManifest,
  updateQuizSource,
  validateRepositoryId,
} from "../repositories/quiz-crud.js";
import {
  createQuizQuestion,
  deleteQuizQuestion,
  loadQuizQuestions,
  markAllQuizQuestionsReviewed,
  quizQuestionFile,
  reorderQuizQuestions,
  resetQuizQuestion,
  saveQuizQuestion,
} from "../repositories/quiz-questions.js";
import {
  loadAlphabetDictionary,
  localizedAlphabetDictionary,
  saveAlphabetDictionary,
} from "../repositories/alphabet-dictionary.js";
import { withSpeechLanguageSettings } from "../core/speech-settings.js";
import type { SpeechLanguage, SpeechLanguageSettings } from "../core/models.js";
import {
  reviewedTopicQuizzes,
  shouldPublishContainingTopic,
} from "../core/content-v2-publish-policy.js";
import {
  createPublishPayloadFromQuestions,
  recordPublishedHash,
} from "../repositories/quiz-publishing.js";
import { SettingsStore } from "./settings.js";
import { FirebaseAuthService } from "./firebase-auth.js";
import { LocalAiService } from "./local-ai.js";
import { AiMigrationJobManager } from "./ai-migration-jobs.js";
import { PublishJobManager } from "./publish-jobs.js";
import { WebDeploymentJobManager } from "./web-deployment-jobs.js";
import { LocalWebRuntimeManager } from "./local-web-runtime.js";
import {
  createContentV2TopicPublishPreview,
  createContentV2QuizPublishPreview,
  FirestorePublishingService,
} from "./firestore-publishing.js";
import {
  calculateContentV2QuizHash,
  loadContentV2Assets,
  loadContentV2Question,
  loadContentV2Quiz,
  loadContentV2QuizResources,
  loadContentV2TopicDictionary,
  loadContentV2Topic,
  recordContentV2Published,
  readContentV2QuizPublishState,
  saveContentV2Question,
  saveContentV2QuizDictionary,
  saveContentV2TopicDictionary,
  saveContentV2Quiz,
  saveContentV2Topic,
  writeContentV2QuizPublishState,
} from "../repositories/content-v2-repository.js";

loadEnvironment({
  path: app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(app.getAppPath(), ".env"),
});

const productName = "GetGo Tools";
const processStartedAt = Date.now();
const startupLog = (stage: string, details: Record<string, unknown> = {}) =>
  console.info(`[GetGo Tools][Startup][+${Date.now() - processStartedAt}ms] ${stage}`, details);
app.setName(productName);
process.title = productName;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = app.isPackaged
  ? path.join(currentDirectory, "../renderer/icons/getgo-app-icon.png")
  : path.join(app.getAppPath(), "src/renderer/public/icons/getgo-app-icon.png");
let mainWindow: BrowserWindow | null = null;
let firebaseAuth: FirebaseAuthService | null = null;

const imagePdfMimeTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

async function loadImagePdfSelection(inputPaths: string[]): Promise<ImagePdfSelection> {
  if (!Array.isArray(inputPaths) || !inputPaths.length || inputPaths.some(value => typeof value !== "string" || !path.isAbsolute(value))) {
    throw new Error("Select valid image files or folders.");
  }
  const files: string[] = [];
  let selectedDirectory: string | null = null;
  for (const inputPath of inputPaths) {
    const stats = await fs.stat(inputPath);
    if (stats.isDirectory()) {
      selectedDirectory ??= inputPath;
      const entries = await fs.readdir(inputPath, { withFileTypes: true });
      files.push(...entries.filter(entry => entry.isFile() && imagePdfMimeTypes[path.extname(entry.name).toLowerCase()]).map(entry => path.join(inputPath, entry.name)));
    } else if (stats.isFile() && imagePdfMimeTypes[path.extname(inputPath).toLowerCase()]) {
      files.push(inputPath);
    }
  }
  const uniqueFiles = [...new Set(files)];
  const images: ImagePdfInput[] = await Promise.all(uniqueFiles.map(async filePath => {
    const [stats, bytes] = await Promise.all([fs.stat(filePath), fs.readFile(filePath)]);
    return {
      path: filePath,
      directory: path.dirname(filePath),
      name: path.basename(filePath),
      size: stats.size,
      mimeType: imagePdfMimeTypes[path.extname(filePath).toLowerCase()],
      data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    };
  }));
  return { images, defaultDirectory: selectedDirectory ?? images[0]?.directory ?? null };
}

async function runAiIpc<T>(
  operation: "generate" | "fix",
  action: () => Promise<T>,
): Promise<T> {
  try {
    return await action();
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    // The provider layer logs sanitized OpenAI diagnostics. This boundary also
    // catches local schema, parsing, formatting, and proposal-validation errors.
    console.error(`[GetGo Tools][AI IPC][${operation}] ${error.message}`);
    if (error.stack) console.error(error.stack);
    throw error;
  }
}

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
    backgroundColor: "#f4f5f2",
    webPreferences: {
      preload: path.join(currentDirectory, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.once("did-finish-load", () => startupLog("Renderer finished loading"));
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else
    void mainWindow.loadFile(
      path.join(currentDirectory, "../renderer/index.html"),
    );
}

app.whenReady().then(async () => {
  startupLog("Electron ready");
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);
  const settings = new SettingsStore(app.getPath("userData"));
  let repositorySnapshot: RepositorySnapshot | null = null;
  let repositoryScanPromise: Promise<RepositorySnapshot> | null = null;
  let repositoryScanPath: string | null = null;
  let repositoryWatcher: FSWatcher | null = null;
  let repositoryWatchTimer: NodeJS.Timeout | null = null;
  let knownRepositoryPaths = new Set<string>();
  const structureRoots = ["content-v2", "quizzes", "schemas", "generated"];
  const ignoredStructureNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini", "publish-state.json"]);
  const ignoredRepositoryPath = (value: string) => value
    .split(/[\\/]/)
    .some((segment) =>
      ignoredStructureNames.has(segment)
      || segment.startsWith(".")
      || segment.endsWith("~")
      || /^~\$/.test(segment)
      || /\.sw[opx]$/i.test(segment)
      || /\.tmp$/i.test(segment));
  const collectRepositoryPaths = async (repositoryPath: string) => {
    const startedAt = Date.now();
    const result = new Set<string>();
    const visit = async (absolute: string, relative: string): Promise<void> => {
      const entries = await fs.readdir(absolute, { withFileTypes: true }).catch(() => []);
      await Promise.all(entries.map(async (entry) => {
        const childRelative = path.join(relative, entry.name);
        if (ignoredRepositoryPath(childRelative)) return;
        result.add(childRelative);
        if (entry.isDirectory()) await visit(path.join(absolute, entry.name), childRelative);
      }));
    };
    await Promise.all(structureRoots.map((name) => visit(path.join(repositoryPath, name), name)));
    console.info("[GetGo Tools][Repository paths] Collected", {
      paths: result.size,
      durationMs: Date.now() - startedAt,
    });
    return result;
  };
  const samePaths = (left: Set<string>, right: Set<string>) =>
    left.size === right.size && [...left].every((item) => right.has(item));
  const startRepositoryWatcher = async (repositoryPath: string) => {
    repositoryWatcher?.close();
    repositoryWatcher = null;
    if (repositoryWatchTimer) clearTimeout(repositoryWatchTimer);
    knownRepositoryPaths = await collectRepositoryPaths(repositoryPath);
    repositoryWatcher = watch(repositoryPath, { recursive: true }, (eventType, filename) => {
      if (eventType !== "rename" || !filename) return;
      const relative = String(filename);
      if (ignoredRepositoryPath(relative)) return;
      if (!structureRoots.some((root) => relative === root || relative.startsWith(`${root}${path.sep}`))) return;
      if (repositoryWatchTimer) clearTimeout(repositoryWatchTimer);
      repositoryWatchTimer = setTimeout(() => {
        void collectRepositoryPaths(repositoryPath).then((nextPaths) => {
          if (samePaths(knownRepositoryPaths, nextPaths)) return;
          knownRepositoryPaths = nextPaths;
          mainWindow?.webContents.send("repository:structure-changed", {
            detectedAt: new Date().toISOString(),
            path: relative,
          });
        }).catch((cause) => console.error(`[GetGo Tools][Repository structure watcher] ${cause instanceof Error ? cause.message : String(cause)}`));
      }, 250);
    });
    repositoryWatcher.on("error", (cause) =>
      console.error(`[GetGo Tools][Repository structure watcher] ${cause.message}`));
  };
  const acceptCurrentRepositoryStructure = async (repositoryPath: string) => {
    if (repositoryWatchTimer) {
      clearTimeout(repositoryWatchTimer);
      repositoryWatchTimer = null;
    }
    knownRepositoryPaths = await collectRepositoryPaths(repositoryPath);
  };
  const scanRepository = async (
    repositoryPath: string,
    options?: Parameters<typeof scanQuizRepository>[1],
    force = false,
  ) => {
    const scanStartedAt = Date.now();
    const resolved = path.resolve(repositoryPath);
    if (!force && repositorySnapshot?.repositoryPath === resolved) {
      console.info("[GetGo Tools][Repository index] Reused lightweight snapshot", {
        durationMs: Date.now() - scanStartedAt,
      });
      return repositorySnapshot;
    }
    if (repositoryScanPromise) {
      if (!force && repositoryScanPath === resolved)
        return repositoryScanPromise;
      await repositoryScanPromise;
      return scanRepository(resolved, options, force);
    }
    repositoryScanPath = resolved;
    repositoryScanPromise = (async () => {
      const next = await scanQuizRepository(resolved, options);
      repositorySnapshot = next;
      await startRepositoryWatcher(resolved);
      console.info("[GetGo Tools][Repository index] Snapshot ready", {
        contests: next.contests.length,
        legacyQuizzes: next.quizzes.length,
        contentV2Topics: next.contentV2.topics.length,
        contentV2Quizzes: next.contentV2.quizzes.length,
        contentV2Questions: next.contentV2.questions.length,
        durationMs: Date.now() - scanStartedAt,
      });
      return next;
    })();
    try {
      return await repositoryScanPromise;
    } finally {
      repositoryScanPromise = null;
      repositoryScanPath = null;
    }
  };
  const requireSnapshot = (): RepositorySnapshot => {
    if (!repositorySnapshot)
      throw new Error(
        "Repository data is not loaded. Restart Tools or choose the repository again.",
      );
    return repositorySnapshot;
  };
  const waitForSnapshot = async (
    repositoryPath: string,
  ): Promise<RepositorySnapshot> => {
    const resolved = path.resolve(repositoryPath);
    if (repositorySnapshot?.repositoryPath === resolved)
      return repositorySnapshot;
    if (repositoryScanPromise && repositoryScanPath === resolved) {
      const snapshot = await repositoryScanPromise;
      if (snapshot.repositoryPath === resolved) return snapshot;
    }
    throw new Error(
      "Repository data is not loaded. Restart Tools or choose the repository again.",
    );
  };
  const replaceQuiz = async (
    root: string,
    manifestPath: string,
  ): Promise<RepositorySnapshot> => {
    const quiz = await readQuizSummary(root, manifestPath);
    const snapshot = requireSnapshot();
    repositorySnapshot = {
      ...snapshot,
      quizzes: [
        ...snapshot.quizzes.filter(
          (item) => item.manifestPath !== manifestPath && item.key !== quiz.key,
        ),
        quiz,
      ].sort((a, b) => a.key.localeCompare(b.key)),
    };
    await acceptCurrentRepositoryStructure(root);
    return repositorySnapshot;
  };
  const settingsStartedAt = Date.now();
  const initialSettings = await settings.read();
  startupLog("Settings loaded", {
    durationMs: Date.now() - settingsStartedAt,
    hasRepository: Boolean(initialSettings.repositoryPath),
  });
  if (initialSettings.repositoryPath) {
    const startupScanStartedAt = Date.now();
    try {
      await scanRepository(initialSettings.repositoryPath);
      startupLog("Startup repository index ready", {
        durationMs: Date.now() - startupScanStartedAt,
      });
    } catch (cause) {
      console.error(
        `[GetGo Tools][Repository startup scan] ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
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
  ipcMain.handle("utility:pdf:browse", async (_event, mode: unknown) => {
    if (mode !== "files" && mode !== "folder") throw new Error("Invalid image browse mode.");
    const selection = await dialog.showOpenDialog({
      title: mode === "folder" ? "Choose image folder" : "Choose images",
      properties: mode === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"],
      filters: mode === "files" ? [{ name: "Images", extensions: Object.keys(imagePdfMimeTypes).map(value => value.slice(1)) }] : undefined,
    });
    if (selection.canceled || !selection.filePaths.length) return null;
    return loadImagePdfSelection(selection.filePaths);
  });
  ipcMain.handle("utility:pdf:load-inputs", (_event, inputPaths: unknown) => {
    if (!Array.isArray(inputPaths) || inputPaths.some(value => typeof value !== "string")) throw new Error("Invalid dropped paths.");
    return loadImagePdfSelection(inputPaths);
  });
  ipcMain.handle("utility:pdf:save", async (_event, data: unknown, suggestedName: unknown, defaultDirectory: unknown) => {
    if (!(data instanceof ArrayBuffer)) throw new Error("Generated PDF data is invalid.");
    if (data.byteLength < 5 || data.byteLength > 250 * 1024 * 1024) throw new Error("Generated PDF size is invalid.");
    const safeName = typeof suggestedName === "string"
      ? path.basename(suggestedName).replace(/[^a-zA-Z0-9._-]/g, "-")
      : "images.pdf";
    const filename = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
    let outputDirectory = app.getPath("documents");
    if (typeof defaultDirectory === "string" && path.isAbsolute(defaultDirectory)) {
      try {
        if ((await fs.stat(defaultDirectory)).isDirectory()) outputDirectory = defaultDirectory;
      } catch {
        // Fall back to Documents when the original image folder is unavailable.
      }
    }
    const selection = await dialog.showSaveDialog({
      title: "Save image PDF",
      defaultPath: path.join(outputDirectory, filename),
      filters: [{ name: "PDF document", extensions: ["pdf"] }],
    });
    if (selection.canceled || !selection.filePath) return null;
    await fs.writeFile(selection.filePath, Buffer.from(data));
    return { filePath: selection.filePath };
  });
  ipcMain.handle("auth:state", () => firebaseAuth!.state());
  ipcMain.handle("environment:readiness", () => firebaseAuth!.checkReadiness());
  ipcMain.handle(
    "auth:sign-in",
    (_event, email: unknown, password: unknown) => {
      if (
        typeof email !== "string" ||
        typeof password !== "string" ||
        !email.includes("@") ||
        password.length < 1
      )
        throw new Error("Enter a valid email and password.");
      return firebaseAuth!.signIn(email.trim(), password);
    },
  );
  ipcMain.handle("auth:sign-out", () => firebaseAuth!.signOut());
  ipcMain.handle("auth:change-password", (_event, password: unknown) => {
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 256
    )
      throw new Error("Password must contain at least 8 characters.");
    return firebaseAuth!.changePassword(password);
  });
  ipcMain.handle("auth:provider", (_event, provider: unknown) => {
    if (!(["google", "facebook", "apple"] as unknown[]).includes(provider))
      throw new Error("Unsupported sign-in provider.");
    return firebaseAuth!.signInWithProvider(
      provider as "google" | "facebook" | "apple",
    );
  });
  ipcMain.handle("ai:dynamic-question", (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid AI request.");
    const value = input as Record<string, unknown>;
    if (
      !value.question ||
      typeof value.question !== "object" ||
      Array.isArray(value.question)
    )
      throw new Error("A local question record is required.");
    if (
      value.context !== undefined &&
      (!value.context ||
        typeof value.context !== "object" ||
        Array.isArray(value.context))
    )
      throw new Error("AI context must be an object.");
    if (
      value.instructions !== undefined &&
      typeof value.instructions !== "string"
    )
      throw new Error("AI instructions must be text.");
    return runAiIpc("generate", () =>
      localAi.createDynamicQuestionProposal(
        value as {
          question: import("../core/models.js").QuizQuestionRecord;
          context?: Record<string, unknown>;
          instructions?: string;
        },
      ),
    );
  });
  ipcMain.handle("ai:fix-dynamic-question", (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid AI fix request.");
    const value = input as Record<string, unknown>;
    if (
      !value.originalQuestion ||
      typeof value.originalQuestion !== "object" ||
      Array.isArray(value.originalQuestion)
    )
      throw new Error("The immutable original question is required.");
    if (
      !value.currentCode ||
      typeof value.currentCode !== "object" ||
      Array.isArray(value.currentCode)
    )
      throw new Error("Current question code is required.");
    if (
      !value.currentSummary ||
      typeof value.currentSummary !== "object" ||
      Array.isArray(value.currentSummary)
    )
      throw new Error("Current AI summary is required.");
    if (typeof value.instructions !== "string" || !value.instructions.trim())
      throw new Error("Fix instructions are required.");
    return runAiIpc("fix", () =>
      localAi.fixDynamicQuestion(
        value as Parameters<typeof localAi.fixDynamicQuestion>[0],
      ),
    );
  });
  ipcMain.handle("ai:cancel-dynamic-question", () =>
    localAi.cancelDynamicQuestionAi(),
  );
  ipcMain.handle("ai-migration:start", (_event, input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Invalid AI migration job.");
    const value = input as Record<string, unknown>;
    if (
      typeof value.manifestPath !== "string" ||
      !value.context ||
      typeof value.context !== "object" ||
      Array.isArray(value.context)
    )
      throw new Error("A quiz manifest and context are required.");
    return aiMigrationJobs.start(
      value as { manifestPath: string; context: Record<string, unknown> },
    );
  });
  ipcMain.handle("ai-migration:list", () => aiMigrationJobs.list());
  ipcMain.handle("ai-migration:concurrency", (_event, concurrency: unknown) => {
    if (typeof concurrency !== "number" || !Number.isInteger(concurrency))
      throw new Error("Invalid job concurrency.");
    return aiMigrationJobs.setConcurrency(concurrency);
  });
  ipcMain.handle("ai-migration:cancel", (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid migration job.");
    return aiMigrationJobs.cancel(jobId);
  });
  const backgroundJobsSnapshot = async () => {
    const [migration, published, deployments] = await Promise.all([
      aiMigrationJobs.list(),
      publishJobs.list(),
      webDeploymentJobs.list(),
    ]);
    const migrated = migration.jobs.map((job) => ({
      id: job.id,
      kind: "ai-migrate" as const,
      name: `AI migrate · ${job.quizTitle}`,
      description: job.errors.at(-1)
        ? `Question ${job.errors.at(-1)?.questionNo}: ${job.errors.at(-1)?.message}`
        : `${job.succeeded} migrated · ${job.failed} failed · ${job.skippedImages + job.skippedVerified} skipped`,
      status: job.status,
      completed: job.processed,
      total: job.total,
      progressLabel: job.currentQuestion
        ? `Question ${job.currentQuestion}`
        : `${job.processed}/${job.total}`,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      route: `/quizzes/contests/${encodeURIComponent(job.contestId)}/quizzes/${encodeURIComponent(job.quizId)}`,
      cancellable: ["queued", "running", "paused"].includes(job.status),
      retryable: ["failed", "cancelled"].includes(job.status),
      error: job.errors.at(-1)?.message,
    }));
    return {
      aiConcurrency: migration.concurrency,
      jobs: [...migrated, ...published, ...deployments].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    };
  };
  ipcMain.handle("jobs:list", backgroundJobsSnapshot);
  ipcMain.handle("deployment:start", async (_event, operation: unknown, component: unknown, target: unknown) => {
    if (!(operation === "build" || operation === "deploy"))
      throw new Error("Invalid deployment operation.");
    if (!(component === "firebase-rules" || component === "web"))
      throw new Error("Invalid deployment component.");
    if (!(target === "development" || target === "staging" || target === "production"))
      throw new Error("Invalid deployment target.");
    await webDeploymentJobs.start(operation, component, target);
    return backgroundJobsSnapshot();
  });
  ipcMain.handle("deployment:state", (_event, target: unknown) => {
    if (!(target === "development" || target === "staging" || target === "production"))
      throw new Error("Invalid deployment target.");
    return webDeploymentJobs.state(target);
  });
  ipcMain.handle("local-web:state", () => localWebRuntime.state());
  ipcMain.handle("local-web:start", () => localWebRuntime.start());
  ipcMain.handle("local-web:restart", () => localWebRuntime.restart());
  ipcMain.handle("jobs:cancel", async (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid job ID.");
    await Promise.all([
      aiMigrationJobs.cancel(jobId),
      publishJobs.cancel(jobId),
      webDeploymentJobs.cancel(jobId),
    ]);
    return backgroundJobsSnapshot();
  });
  ipcMain.handle("jobs:pause", async (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid job ID.");
    await Promise.all([
      aiMigrationJobs.pause(jobId),
      publishJobs.pause(jobId),
      webDeploymentJobs.pause(jobId),
    ]);
    return backgroundJobsSnapshot();
  });
  ipcMain.handle("jobs:resume", async (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid job ID.");
    await Promise.all([
      aiMigrationJobs.resume(jobId),
      publishJobs.resume(jobId),
      webDeploymentJobs.resume(jobId),
    ]);
    return backgroundJobsSnapshot();
  });
  ipcMain.handle("jobs:retry", async (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid job ID.");
    await Promise.all([
      aiMigrationJobs.retry(jobId),
      publishJobs.retry(jobId),
      webDeploymentJobs.retry(jobId),
    ]);
    return backgroundJobsSnapshot();
  });
  ipcMain.handle("jobs:delete", async (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid job ID.");
    await Promise.all([
      aiMigrationJobs.delete(jobId),
      publishJobs.delete(jobId),
      webDeploymentJobs.delete(jobId),
    ]);
    return backgroundJobsSnapshot();
  });
  ipcMain.handle("publishing:status", async () => {
    const current = await settings.read();
    if (!current.repositoryPath)
      throw new Error("Choose a quiz repository first.");
    return publishing.reconcile(await waitForSnapshot(current.repositoryPath));
  });
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
  ipcMain.handle("settings:get", () => settings.read());
  ipcMain.handle("repository:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const snapshot = await scanRepository(result.filePaths[0]);
    await settings.update({ repositoryPath: snapshot.repositoryPath });
    return snapshot;
  });
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
  ipcMain.handle("content-v2:topic:load", async (_event, topicId: unknown) => {
    if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
    return loadContentV2Topic(await repositoryRoot(), topicId);
  });
  ipcMain.handle(
    "content-v2:quiz:load",
    async (_event, topicId: unknown, quizId: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid quiz selection.");
      return loadContentV2Quiz(await repositoryRoot(), topicId, quizId);
    },
  );
  ipcMain.handle(
    "content-v2:question:load",
    async (_event, topicId: unknown, quizId: unknown, questionId: unknown) => {
      if (
        typeof topicId !== "string" ||
        typeof quizId !== "string" ||
        typeof questionId !== "string"
      )
        throw new Error("Invalid question selection.");
      return loadContentV2Question(
        await repositoryRoot(),
        topicId,
        quizId,
        questionId,
      );
    },
  );
  ipcMain.handle(
    "content-v2:quiz:resources",
    async (_event, topicId: unknown, quizId: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid quiz selection.");
      const root = await repositoryRoot();
      const quiz = await loadContentV2Quiz(root, topicId, quizId);
      const resources = await loadContentV2QuizResources(root, topicId, quiz);
      if (quiz.type !== "alphabet" && quiz.type !== "spelling") return resources;
      return {
        ...resources,
        dictionary: localizedAlphabetDictionary(
          resources.dictionary as Parameters<typeof localizedAlphabetDictionary>[0],
          quiz.language,
        ),
      };
    },
  );
  ipcMain.handle(
    "content-v2:quiz:dictionary:save",
    async (_event, topicId: unknown, quizId: unknown, value: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid quiz selection.");
      const root = await repositoryRoot();
      const quiz = await loadContentV2Quiz(root, topicId, quizId);
      await saveContentV2QuizDictionary(root, topicId, quiz, value);
      const current = requireSnapshot();
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          quizzes: current.contentV2.quizzes.map((item) =>
            item.topicId === topicId ? { ...item, localHash: "" } : item),
        },
      };
      return requireSnapshot();
    },
  );
  ipcMain.handle("content-v2:topic:dictionary:load", async (_event, topicId: unknown) => {
    if (typeof topicId !== "string") throw new Error("Invalid topic selection.");
    return loadContentV2TopicDictionary(await repositoryRoot(), topicId);
  });
  ipcMain.handle("content-v2:topic:dictionary:save", async (_event, topicId: unknown, value: unknown) => {
    if (typeof topicId !== "string") throw new Error("Invalid topic selection.");
    const root = await repositoryRoot();
    await saveContentV2TopicDictionary(root, topicId, value);
    const current = requireSnapshot();
    repositorySnapshot = {
      ...current,
      contentV2: {
        ...current.contentV2,
        quizzes: current.contentV2.quizzes.map((item) =>
          item.topicId === topicId ? { ...item, localHash: "" } : item),
      },
    };
    return requireSnapshot();
  });
  const topicAssetsDirectory = async (topicId: unknown) => {
    if (typeof topicId !== "string" || !/^[a-z][a-z0-9-]*$/.test(topicId))
      throw new Error("Invalid topic selection.");
    return path.join(await repositoryRoot(), "content-v2", "topics", topicId, "assets");
  };
  const listTopicAssets = async (topicId: unknown) => {
    const directory = await topicAssetsDirectory(topicId);
    await fs.mkdir(directory, { recursive: true });
    const supported: Record<string, string> = {
      ".avif": "image/avif", ".gif": "image/gif", ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
    };
    const files: string[] = [];
    const visit = async (current: string) => {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) await visit(absolute);
        else if (entry.isFile() && supported[path.extname(entry.name).toLowerCase()])
          files.push(path.relative(directory, absolute).replaceAll(path.sep, "/"));
      }
    };
    await visit(directory);
    const assets = await Promise.all(files.map(async (filename) => ({
      filename,
      size: (await fs.stat(path.join(directory, filename))).size,
      mimeType: supported[path.extname(filename).toLowerCase()]!,
    })));
    return assets.sort((left, right) => left.filename.localeCompare(right.filename));
  };
  ipcMain.handle("content-v2:topic:assets:list", (_event, topicId: unknown) => listTopicAssets(topicId));
  ipcMain.handle("content-v2:topic:asset:read", async (_event, topicId: unknown, filename: unknown) => {
    if (typeof filename !== "string" || path.isAbsolute(filename) || filename.split(/[\\/]/).some((part) => !part || part === "." || part === ".."))
      throw new Error("Invalid asset selection.");
    const directory = await topicAssetsDirectory(topicId);
    const assetPath = path.resolve(directory, filename);
    if (!assetPath.startsWith(`${path.resolve(directory)}${path.sep}`)) throw new Error("Invalid asset selection.");
    const mimeTypes: Record<string, string> = {
      ".avif": "image/avif", ".gif": "image/gif", ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
    };
    const mimeType = mimeTypes[path.extname(assetPath).toLowerCase()];
    if (!mimeType || !(await fs.stat(assetPath).then((value) => value.isFile()).catch(() => false)))
      throw new Error("The selected asset was not found.");
    return `data:${mimeType};base64,${(await fs.readFile(assetPath)).toString("base64")}`;
  });
  ipcMain.handle("content-v2:topic:assets:import", async (_event, topicId: unknown) => {
    const directory = await topicAssetsDirectory(topicId);
    const selection = await dialog.showOpenDialog(mainWindow!, {
      title: "Import shared topic assets",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"] }],
    });
    if (selection.canceled) return listTopicAssets(topicId);
    const existing = new Set((await listTopicAssets(topicId)).map((item) => item.filename));
    const duplicates = selection.filePaths.map((file) => path.basename(file)).filter((name) => existing.has(name));
    if (duplicates.length) throw new Error(`Already exists: ${duplicates.join(", ")}`);
    await Promise.all(selection.filePaths.map((file) => fs.copyFile(file, path.join(directory, path.basename(file)))));
    await acceptCurrentRepositoryStructure(await repositoryRoot());
    return listTopicAssets(topicId);
  });
  ipcMain.handle("content-v2:topic:asset:trash", async (_event, topicId: unknown, filename: unknown) => {
    if (typeof filename !== "string" || path.isAbsolute(filename) || filename.split(/[\\/]/).some((part) => !part || part === "." || part === ".."))
      throw new Error("Invalid asset selection.");
    const dictionary = await loadContentV2TopicDictionary(await repositoryRoot(), String(topicId));
    if (JSON.stringify(dictionary).includes(`asset:${filename}`))
      throw new Error("This asset is still referenced by the shared dictionary.");
    const root = await repositoryRoot();
    const referencingQuestion = (await Promise.all(
      requireSnapshot().contentV2.questions
        .filter((question) => question.topicId === topicId)
        .map((question) => loadContentV2Question(root, question.topicId, question.quizId, question.id)),
    )).some((question) => JSON.stringify(question).includes(`asset:${filename}`));
    if (referencingQuestion)
      throw new Error("This asset is still referenced by a quiz question.");
    const assetsDirectory = await topicAssetsDirectory(topicId);
    const assetPath = path.resolve(assetsDirectory, filename);
    if (!assetPath.startsWith(`${path.resolve(assetsDirectory)}${path.sep}`)) throw new Error("Invalid asset selection.");
    await shell.trashItem(assetPath);
    await acceptCurrentRepositoryStructure(root);
    return listTopicAssets(topicId);
  });
  ipcMain.handle("content-v2:topic:assets:show", async (_event, topicId: unknown) => {
    await shell.openPath(await topicAssetsDirectory(topicId));
  });
  ipcMain.handle("content-v2:topic:save", async (_event, value: unknown) => {
    const root = await repositoryRoot();
    const saved = await saveContentV2Topic(root, value);
    const current = requireSnapshot();
    const existing = current.contentV2.topics.find(
      (item) => item.id === saved.id,
    );
    const topicQuizzes = current.contentV2.quizzes.filter(
      (item) => item.topicId === saved.id,
    );
    const summary = {
      ...(existing ?? {}),
      id: saved.id,
      type: saved.type,
      title: saved.title,
      description: saved.description,
      status: saved.status,
      order: saved.order,
      filePath:
        existing?.filePath ??
        path.join(root, "content-v2", "topics", saved.id, "topic.json"),
      localHash: hashContentV2({
        topic: sanitizeContentV2Topic(saved),
        quizzes: topicQuizzes.map(({ id, type, order }) => ({ id, type, order })),
      }),
      publishedHash: saved.publishedHash ?? null,
      publishedAt: saved.publishedAt ?? null,
      quizCount: topicQuizzes.length,
      ...(saved.type === "competition"
        ? {
            subject: saved.subject,
            rounds: saved.rounds,
            gradeGroups: saved.gradeGroups,
          }
        : {
            supportedLanguages: saved.supportedLanguages,
            recommendedAgeRange: saved.recommendedAgeRange,
          }),
    };
    repositorySnapshot = {
      ...current,
      contentV2: {
        ...current.contentV2,
        topics: existing
          ? current.contentV2.topics.map((item) =>
              item.id === saved.id ? summary : item,
            )
          : [...current.contentV2.topics, summary],
      },
    };
    await acceptCurrentRepositoryStructure(root);
    return requireSnapshot();
  });
  ipcMain.handle(
    "content-v2:quiz:save",
    async (_event, topicId: unknown, value: unknown) => {
      if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
      const root = await repositoryRoot();
      const topic = await loadContentV2Topic(root, topicId);
      const saved = await saveContentV2Quiz(root, topic, value);
      const current = requireSnapshot();
      const existing = current.contentV2.quizzes.find(
        (item) => item.topicId === topicId && item.id === saved.id,
      );
      const quizQuestions = current.contentV2.questions.filter(
        (item) => item.topicId === topicId && item.quizId === saved.id,
      );
      const localHash = await calculateContentV2QuizHash(root, topicId, saved.id);
      const summary = {
        ...(existing ?? {}),
        key: `${topicId}/${saved.id}`,
        topicId,
        id: saved.id,
        type: saved.type,
        title: saved.title,
        description: saved.description,
        status: saved.status,
        order: saved.order,
        filePath:
          existing?.filePath ??
          path.join(
            root,
            "content-v2",
            "topics",
            topicId,
            "quizzes",
            saved.id,
            "quiz.json",
          ),
        localHash,
        publishedHash: saved.publishedHash ?? null,
        publishedAt: saved.publishedAt ?? null,
        questionCount: quizQuestions.length,
        reviewedQuestionCount: quizQuestions.filter(
          (item) => item.status === "reviewed",
        ).length,
        ...(saved.type === "competition-paper"
          ? { grade: saved.grade, round: saved.round, year: saved.year }
          : { language: saved.language }),
      };
      const quizzes = existing
        ? current.contentV2.quizzes.map((item) =>
            item.key === summary.key ? summary : item,
          )
        : [...current.contentV2.quizzes, summary];
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          quizzes,
          topics: current.contentV2.topics.map((item) =>
            item.id === topicId
              ? {
                  ...item,
                  quizCount: quizzes.filter((quiz) => quiz.topicId === topicId).length,
                  localHash: hashContentV2({
                    topic: sanitizeContentV2Topic(topic),
                    quizzes: quizzes
                      .filter((quiz) => quiz.topicId === topicId)
                      .map(({ id, type, order }) => ({ id, type, order })),
                  }),
                }
              : item,
          ),
        },
      };
      await acceptCurrentRepositoryStructure(root);
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "content-v2:question:save",
    async (_event, topicId: unknown, quizId: unknown, value: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid question selection.");
      const root = await repositoryRoot();
      const [topic, quiz] = await Promise.all([
        loadContentV2Topic(root, topicId),
        loadContentV2Quiz(root, topicId, quizId),
      ]);
      const saved = await saveContentV2Question(root, topic, quiz, value);
      const current = requireSnapshot();
      const key = `${topicId}/${quizId}/${saved.id}`;
      const existing = current.contentV2.questions.find(
        (item) => item.key === key,
      );
      const localHash = hashContentV2(sanitizeContentV2Question(saved));
      const questionSummary = {
        key,
        topicId,
        quizId,
        id: saved.id,
        type: saved.type,
        order: saved.order,
        status: saved.status,
        filePath:
          existing?.filePath ??
          path.join(
            root,
            "content-v2",
            "topics",
            topicId,
            "quizzes",
            quizId,
            "questions",
            `${saved.id}.json`,
          ),
        localHash,
        label:
          saved.type === "alphabet-letter"
            ? `${saved.uppercase} ${saved.lowercase}`
            : Array.isArray(saved.text.en)
              ? saved.text.en.join(" ")
              : saved.text.en,
        ...(saved.type === "competition-question"
          ? {
              category: saved.category,
              hasImages: saved.assets.length > 0,
              dynamic: Boolean(saved.dynamic),
            }
          : {}),
      };
      const questions = existing
        ? current.contentV2.questions.map((item) =>
            item.key === key ? questionSummary : item,
          )
        : [...current.contentV2.questions, questionSummary];
      const quizQuestions = questions.filter(
        (item) => item.topicId === topicId && item.quizId === quizId,
      );
      const quizLocalHash = await calculateContentV2QuizHash(root, topicId, quizId);
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          questions,
          quizzes: current.contentV2.quizzes.map((item) =>
            item.topicId === topicId && item.id === quizId
              ? {
                  ...item,
                  localHash: quizLocalHash,
                  questionCount: quizQuestions.length,
                  reviewedQuestionCount: quizQuestions.filter(
                    (question) => question.status === "reviewed",
                  ).length,
                }
              : item,
          ),
        },
      };
      await acceptCurrentRepositoryStructure(root);
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "content-v2:questions:review-all",
    async (_event, topicId: unknown, quizId: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid question selection.");
      const root = await repositoryRoot();
      const current = requireSnapshot();
      const summaries = current.contentV2.questions.filter(
        (item) => item.topicId === topicId && item.quizId === quizId,
      );
      const [topic, quiz] = await Promise.all([
        loadContentV2Topic(root, topicId),
        loadContentV2Quiz(root, topicId, quizId),
      ]);
      await Promise.all(
        summaries
          .filter((item) => item.status !== "reviewed")
          .map(async (item) => {
            const question = await loadContentV2Question(
              root,
              topicId,
              quizId,
              item.id,
            );
            await saveContentV2Question(root, topic, quiz, {
              ...question,
              status: "reviewed",
            });
          }),
      );
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          questions: current.contentV2.questions.map((item) =>
            item.topicId === topicId && item.quizId === quizId
              ? { ...item, status: "reviewed" }
              : item,
          ),
          quizzes: current.contentV2.quizzes.map((item) =>
            item.topicId === topicId && item.id === quizId
              ? { ...item, reviewedQuestionCount: summaries.length }
              : item,
          ),
        },
      };
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "content-v2:topic:delete",
    async (_event, topicId: unknown) => {
      if (typeof topicId !== "string" || !/^[a-z][a-z0-9-]*$/.test(topicId))
        throw new Error("Invalid topic ID.");
      const root = await repositoryRoot();
      const directory = path.join(root, "content-v2", "topics", topicId);
      await fs.access(path.join(directory, "topic.json"));
      await shell.trashItem(directory);
      const current = requireSnapshot();
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          topics: current.contentV2.topics.filter((item) => item.id !== topicId),
          quizzes: current.contentV2.quizzes.filter((item) => item.topicId !== topicId),
          questions: current.contentV2.questions.filter((item) => item.topicId !== topicId),
        },
      };
      await acceptCurrentRepositoryStructure(root);
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "content-v2:quiz:delete",
    async (_event, topicId: unknown, quizId: unknown) => {
      if (
        typeof topicId !== "string" ||
        typeof quizId !== "string" ||
        !/^[a-z][a-z0-9-]*$/.test(topicId) ||
        !/^[a-z][a-z0-9-]*$/.test(quizId)
      )
        throw new Error("Invalid quiz selection.");
      const root = await repositoryRoot();
      const directory = path.join(
        root,
        "content-v2",
        "topics",
        topicId,
        "quizzes",
        quizId,
      );
      await fs.access(path.join(directory, "quiz.json"));
      await shell.trashItem(directory);
      const current = requireSnapshot();
      const quizzes = current.contentV2.quizzes.filter(
        (item) => !(item.topicId === topicId && item.id === quizId),
      );
      const topic = await loadContentV2Topic(root, topicId);
      const topicQuizzes = quizzes.filter((item) => item.topicId === topicId);
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          quizzes,
          questions: current.contentV2.questions.filter(
            (item) => !(item.topicId === topicId && item.quizId === quizId),
          ),
          topics: current.contentV2.topics.map((item) =>
            item.id === topicId
              ? {
                  ...item,
                  quizCount: topicQuizzes.length,
                  localHash: hashContentV2({
                    topic: sanitizeContentV2Topic(topic),
                    quizzes: topicQuizzes.map(({ id, type, order }) => ({ id, type, order })),
                  }),
                }
              : item,
          ),
        },
      };
      await acceptCurrentRepositoryStructure(root);
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "content-v2:question:delete",
    async (_event, topicId: unknown, quizId: unknown, questionId: unknown) => {
      const ids = [topicId, quizId, questionId];
      if (
        ids.some(
          (value) =>
            typeof value !== "string" || !/^[a-z][a-z0-9-]*$/.test(value),
        )
      )
        throw new Error("Invalid question selection.");
      const root = await repositoryRoot();
      const filePath = path.join(
        root,
        "content-v2",
        "topics",
        topicId as string,
        "quizzes",
        quizId as string,
        "questions",
        `${questionId}.json`,
      );
      await fs.access(filePath);
      await shell.trashItem(filePath);
      const current = requireSnapshot();
      const typedTopicId = topicId as string;
      const typedQuizId = quizId as string;
      const typedQuestionId = questionId as string;
      const localHash = await calculateContentV2QuizHash(root, typedTopicId, typedQuizId);
      const questions = current.contentV2.questions.filter(
        (item) =>
          !(item.topicId === typedTopicId && item.quizId === typedQuizId && item.id === typedQuestionId),
      );
      const quizQuestions = questions.filter(
        (item) => item.topicId === typedTopicId && item.quizId === typedQuizId,
      );
      repositorySnapshot = {
        ...current,
        contentV2: {
          ...current.contentV2,
          questions,
          quizzes: current.contentV2.quizzes.map((item) =>
            item.topicId === typedTopicId && item.id === typedQuizId
              ? {
                  ...item,
                  localHash,
                  questionCount: quizQuestions.length,
                  reviewedQuestionCount: quizQuestions.filter(
                    (question) => question.status === "reviewed",
                  ).length,
                }
              : item,
          ),
        },
      };
      await acceptCurrentRepositoryStructure(root);
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "content-v2:topic:publish-preview",
    async (_event, topicId: unknown) => {
      if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
      const root = await repositoryRoot();
      const snapshot = requireSnapshot();
      const summary = snapshot.contentV2.topics.find((item) => item.id === topicId);
      if (!summary) throw new Error("The selected topic was not found.");
      const topic = await loadContentV2Topic(root, topicId);
      const quizIds = reviewedTopicQuizzes(
        snapshot.contentV2.quizzes,
        topicId,
      ).map((quiz) => quiz.id);
      return createContentV2TopicPublishPreview(topic, summary.localHash, quizIds);
    },
  );
  ipcMain.handle(
    "content-v2:topic:publish",
    async (_event, topicId: unknown) => {
      if (typeof topicId !== "string") throw new Error("Invalid topic ID.");
      const root = await repositoryRoot();
      const snapshot = requireSnapshot();
      const summary = snapshot.contentV2.topics.find(
        (item) => item.id === topicId,
      );
      if (!summary) throw new Error("The selected topic was not found.");
      const topic = await loadContentV2Topic(root, topicId);
      const reviewedQuizzes = reviewedTopicQuizzes(
        snapshot.contentV2.quizzes,
        topicId,
      );
      for (const quiz of reviewedQuizzes)
        if (quiz.questionCount !== quiz.reviewedQuestionCount)
          throw new Error(
            `Quiz "${quiz.title}" is marked reviewed but still contains unreviewed questions.`,
          );
      return publishJobs.track(
        {
          name: `Publish topic · ${summary.title}`,
          description: `Publish topic and ${reviewedQuizzes.length} reviewed quizzes to Firebase`,
          route: `/topics/${encodeURIComponent(topicId)}?tab=publish`,
        },
        async (control) => {
          if (!firebaseAuth) throw new Error("Publishing is not initialized.");
          const target = await firebaseAuth.publishingTarget();
          const localQuizIds = snapshot.contentV2.quizzes
            .filter((quiz) => quiz.topicId === topicId)
            .map((quiz) => quiz.id);
          const staleQuizIds = await publishing.staleContentV2TopicQuizIds(
            topicId,
            localQuizIds,
          );
          await control.setTotal(
            reviewedQuizzes.length + staleQuizIds.length + 1,
            `Publishing ${reviewedQuizzes.length} reviewed quizzes · removing ${staleQuizIds.length} deleted quizzes`,
          );
          const publishedQuizResults: Array<{
            key: string;
            contentHash: string;
            publishedAt: string;
          }> = [];
          for (const [index, quizSummary] of reviewedQuizzes.entries()) {
            await control.checkpoint();
            const quiz = await loadContentV2Quiz(root, topicId, quizSummary.id);
            const questionIds = snapshot.contentV2.questions
              .filter(
                (question) =>
                  question.topicId === topicId &&
                  question.quizId === quizSummary.id,
              )
              .sort((left, right) => left.order - right.order)
              .map((question) => question.id);
            const [questions, resources] = await Promise.all([
              Promise.all(
                questionIds.map((questionId) =>
                  loadContentV2Question(
                    root,
                    topicId,
                    quizSummary.id,
                    questionId,
                  ),
                ),
              ),
              loadContentV2QuizResources(root, topicId, quiz),
            ]);
            const assets = await loadContentV2Assets(
              root,
              topicId,
              quizSummary.id,
              { topic, quiz, questions, resources },
            );
            const publishState = await readContentV2QuizPublishState(
              quizSummary.filePath,
            );
            const quizResult = await publishing.publishContentV2Quiz(
              topicId,
              quiz,
              questions,
              resources,
              assets,
              quizSummary.localHash,
              publishState.targets[target.projectId],
            );
            await recordContentV2Published(
              quizSummary.filePath,
              quizResult.contentHash,
              quizResult.publishedAt,
            );
            await writeContentV2QuizPublishState(quizSummary.filePath, {
              schemaVersion: 1,
              targets: {
                ...publishState.targets,
                [quizResult.projectId]: {
                  environment: quizResult.environment,
                  projectId: quizResult.projectId,
                  contentHash: quizResult.contentHash,
                  publishedAt: quizResult.publishedAt,
                  items: quizResult.items,
                },
              },
            });
            publishedQuizResults.push({
              key: quizSummary.key,
              contentHash: quizResult.contentHash,
              publishedAt: quizResult.publishedAt,
            });
            await control.advance(
              `Published reviewed quiz ${index + 1}/${reviewedQuizzes.length}`,
            );
          }
          await publishing.deleteContentV2TopicQuizzes(
            topicId,
            staleQuizIds,
            control,
          );
          // Publish the catalog entry last so it never advertises a reviewed
          // quiz before that quiz has successfully reached Firebase.
          const result = await publishing.publishContentV2Topic(
            topic,
            summary.localHash,
            reviewedQuizzes.map((quiz) => quiz.id),
          );
          await recordContentV2Published(
            summary.filePath,
            result.contentHash,
            result.publishedAt,
          );
          await control.advance("Published topic document");
          if (repositorySnapshot) {
            const publishedByKey = new Map(
              publishedQuizResults.map((item) => [item.key, item]),
            );
            repositorySnapshot = {
              ...repositorySnapshot,
              contentV2: {
                ...repositorySnapshot.contentV2,
                topics: repositorySnapshot.contentV2.topics.map((item) =>
                  item.id === topicId
                    ? {
                        ...item,
                        publishedHash: result.contentHash,
                        publishedAt: result.publishedAt,
                      }
                    : item,
                ),
                quizzes: repositorySnapshot.contentV2.quizzes.map((item) => {
                  const published = publishedByKey.get(item.key);
                  return published
                    ? {
                        ...item,
                        publishedHash: published.contentHash,
                        publishedAt: published.publishedAt,
                      }
                    : item;
                }),
              },
            };
          }
          return { ...result, snapshot: requireSnapshot() };
        },
      );
    },
  );
  ipcMain.handle(
    "content-v2:quiz:publish-preview",
    async (_event, topicId: unknown, quizId: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid quiz selection.");
      const root = await repositoryRoot();
      const snapshot = requireSnapshot();
      const summary = snapshot.contentV2.quizzes.find(
        (item) => item.topicId === topicId && item.id === quizId,
      );
      if (!summary) throw new Error("The selected quiz was not found.");
      const quiz = await loadContentV2Quiz(root, topicId, quizId);
      const topic = await loadContentV2Topic(root, topicId);
      const questionIds = snapshot.contentV2.questions
        .filter(
          (question) =>
            question.topicId === topicId && question.quizId === quizId,
        )
        .sort((left, right) => left.order - right.order)
        .map((question) => question.id);
      const [questions, resources] = await Promise.all([
        Promise.all(
          questionIds.map((questionId) =>
            loadContentV2Question(root, topicId, quizId, questionId),
          ),
        ),
        loadContentV2QuizResources(root, topicId, quiz),
      ]);
      const assets = await loadContentV2Assets(root, topicId, quizId, {
        topic,
        quiz,
        questions,
        resources,
      });
      return createContentV2QuizPublishPreview(
        topicId,
        quiz,
        questions,
        resources,
        assets,
        summary.localHash,
      );
    },
  );
  ipcMain.handle(
    "content-v2:quiz:publish",
    async (_event, topicId: unknown, quizId: unknown) => {
      if (typeof topicId !== "string" || typeof quizId !== "string")
        throw new Error("Invalid quiz selection.");
      const root = await repositoryRoot();
      const snapshot = requireSnapshot();
      const summary = snapshot.contentV2.quizzes.find(
        (item) => item.topicId === topicId && item.id === quizId,
      );
      if (!summary) throw new Error("The selected quiz was not found.");
      if (summary.questionCount !== summary.reviewedQuestionCount)
        throw new Error("Review every question before publishing this quiz.");
      return publishJobs.track(
        {
          name: `Publish · ${summary.title}`,
          description: `Publish ${summary.questionCount} questions to Firebase`,
          route: `/topics/${encodeURIComponent(topicId)}/quizzes/${encodeURIComponent(quizId)}?tab=publish`,
        },
        async (control) => {
      await control.setTotal(
        Math.max(1, summary.questionCount + 1),
        `Preparing questions 0/${summary.questionCount}`,
      );
      const quiz = await loadContentV2Quiz(root, topicId, quizId);
      const topic = await loadContentV2Topic(root, topicId);
      const questionIds = snapshot.contentV2.questions
        .filter(
          (question) =>
            question.topicId === topicId && question.quizId === quizId,
        )
        .sort((left, right) => left.order - right.order)
        .map((question) => question.id);
      let preparedQuestions = 0;
      const [questions, resources] = await Promise.all([
        Promise.all(questionIds.map(async (questionId) => {
          const question = await loadContentV2Question(root, topicId, quizId, questionId);
          preparedQuestions += 1;
          await control.advance(`Preparing questions ${preparedQuestions}/${questionIds.length}`);
          return question;
        })),
        loadContentV2QuizResources(root, topicId, quiz),
      ]);
      const assets = await loadContentV2Assets(root, topicId, quizId, {
        topic,
        quiz,
        questions,
        resources,
      });
      const topicSummary = snapshot.contentV2.topics.find(
        (item) => item.id === topicId,
      );
      if (!topicSummary) throw new Error("The containing topic was not found.");
      const topicQuizIds = reviewedTopicQuizzes(
        snapshot.contentV2.quizzes,
        topicId,
      ).map((item) => item.id);
      await control.checkpoint();
      if (!firebaseAuth) throw new Error("Publishing is not initialized.");
      const target = await firebaseAuth.publishingTarget();
      const publishContainingTopic = shouldPublishContainingTopic(
        await publishing.contentV2TopicExists(topicId),
      );
      const publishState = await readContentV2QuizPublishState(summary.filePath);
      const result = await publishing.publishContentV2Quiz(
        topicId,
        quiz,
        questions,
        resources,
        assets,
        summary.localHash,
        publishState.targets[target.projectId],
        control,
        publishContainingTopic ? 2 : 0,
      );
      const topicResult = publishContainingTopic
        ? await publishing.publishContentV2Topic(
            topic,
            topicSummary.localHash,
            topicQuizIds,
            control,
          )
        : null;
      await recordContentV2Published(
        summary.filePath,
        result.contentHash,
        result.publishedAt,
      );
      if (topicResult)
        await recordContentV2Published(
          topicSummary.filePath,
          topicResult.contentHash,
          topicResult.publishedAt,
        );
      await writeContentV2QuizPublishState(summary.filePath, {
        schemaVersion: 1,
        targets: {
          ...publishState.targets,
          [result.projectId]: {
            environment: result.environment,
            projectId: result.projectId,
            contentHash: result.contentHash,
            publishedAt: result.publishedAt,
            items: result.items,
          },
        },
      });
      if (repositorySnapshot)
        repositorySnapshot = {
          ...repositorySnapshot,
          contentV2: {
            ...repositorySnapshot.contentV2,
            quizzes: repositorySnapshot.contentV2.quizzes.map((item) =>
              item.topicId === topicId && item.id === quizId
                ? {
                    ...item,
                    publishedHash: result.contentHash,
                    publishedAt: result.publishedAt,
                  }
                : item,
            ),
            topics: repositorySnapshot.contentV2.topics.map((item) =>
              topicResult && item.id === topicId
                ? {
                    ...item,
                    publishedHash: topicResult.contentHash,
                    publishedAt: topicResult.publishedAt,
                  }
                : item,
            ),
          },
        };
          return { ...result, snapshot: requireSnapshot() };
        },
      );
    },
  );
  ipcMain.handle(
    "settings:environment",
    (_event, environment: AppSettings["environment"]) => {
      if (!["development", "staging", "production"].includes(environment)) {
        throw new Error("Invalid environment");
      }
      return settings.update({ environment });
    },
  );
  ipcMain.handle(
    "settings:ai-profile",
    async (_event, profile: AppSettings["aiProfile"]) => {
      if (!["thorough", "fast"].includes(profile))
        throw new Error("Invalid AI profile");
      const next = await settings.update({ aiProfile: profile });
      localAi.setProfile(profile);
      aiMigrationJobs.setProfile(profile);
      return next;
    },
  );
  ipcMain.handle("settings:locale", (_event, locale: AppSettings["locale"]) => {
    if (!["en", "vi"].includes(locale)) throw new Error("Invalid locale");
    return settings.update({ locale });
  });
  ipcMain.handle(
    "settings:speech",
    async (_event, language: SpeechLanguage, value: SpeechLanguageSettings) => {
      const current = await settings.read();
      const next = withSpeechLanguageSettings(current, language, value);
      return settings.update({ speech: next.speech });
    },
  );
  ipcMain.handle("shell:show", async (_event, filePath: string) => {
    if (typeof filePath !== "string" || !path.isAbsolute(filePath))
      throw new Error("Invalid path");
    shell.showItemInFolder(filePath);
  });
  ipcMain.handle(
    "shell:show-question",
    async (_event, manifestPath: unknown, questionNo: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      const normalizedQuestionNo = String(questionNo);
      if (!/^\d+$/.test(normalizedQuestionNo))
        throw new Error("Invalid question number");
      shell.showItemInFolder(
        await quizQuestionFile(manifest, normalizedQuestionNo),
      );
    },
  );
  ipcMain.handle("clipboard:write", (_event, text: unknown) => {
    if (typeof text !== "string" || text.length > 2048)
      throw new Error("Invalid clipboard text");
    clipboard.writeText(text);
  });
  ipcMain.handle("resources:youtube:resolve", async (_event, input: unknown) => {
    if (!Array.isArray(input) || input.length > 100 || input.some((value) => typeof value !== "string")) {
      throw new Error("Paste up to 100 YouTube links at a time.");
    }
    return Promise.all(input.map(async (requestedUrl) => {
      try {
        const parsed = new URL(requestedUrl);
        const host = parsed.hostname.toLowerCase();
        let videoId = host === "youtu.be" ? parsed.pathname.split("/").filter(Boolean)[0] : parsed.searchParams.get("v");
        if (!videoId && (host === "youtube.com" || host.endsWith(".youtube.com"))) {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (["shorts", "embed", "live"].includes(parts[0])) videoId = parts[1];
        }
        if ((host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com")) || !videoId || !/^[\w-]{6,20}$/.test(videoId)) {
          throw new Error("Not a valid YouTube video URL");
        }
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const endpoint = new URL("https://www.youtube.com/oembed");
        endpoint.searchParams.set("url", url);
        endpoint.searchParams.set("format", "json");
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
        const watchResponse = await fetch(`${url}&hl=en`, {
          headers: { "accept-language": "en-US,en;q=0.9" },
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);
        if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
        const metadata = await response.json() as { title?: unknown };
        if (typeof metadata.title !== "string" || !metadata.title.trim()) throw new Error("YouTube returned no title");
        let durationSeconds: number | undefined;
        const readDuration = (watchHtml: string) => {
          const secondsMatch = watchHtml.match(/(?:"|\\")lengthSeconds(?:"|\\")\s*:\s*(?:"|\\")?(\d+)/);
          const millisecondsMatch = watchHtml.match(/(?:"|\\")approxDurationMs(?:"|\\")\s*:\s*(?:"|\\")?(\d+)/);
          const parsedDuration = secondsMatch
            ? Number(secondsMatch[1])
            : millisecondsMatch
              ? Math.round(Number(millisecondsMatch[1]) / 1000)
              : Number.NaN;
          return Number.isSafeInteger(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined;
        };
        if (watchResponse?.ok) {
          durationSeconds = readDuration(await watchResponse.text());
        }
        if (!durationSeconds) {
          const retryResponse = await fetch(`${url}&hl=en&gl=US&bpctr=9999999999&has_verified=1`, {
            headers: {
              "accept-language": "en-US,en;q=0.9",
              "cache-control": "no-cache",
            },
            signal: AbortSignal.timeout(10_000),
          }).catch(() => null);
          if (retryResponse?.ok) durationSeconds = readDuration(await retryResponse.text());
        }
        return { url, title: metadata.title.trim(), ...(durationSeconds ? { durationSeconds } : {}) };
      } catch (cause) {
        return { url: requestedUrl, error: cause instanceof Error ? cause.message : String(cause) };
      }
    }));
  });
  ipcMain.handle(
    "shell:open-external",
    async (_event, requestedUrl: unknown) => {
      if (typeof requestedUrl !== "string") throw new Error("Invalid URL");
      const url = new URL(requestedUrl);
      const allowedHosts = new Set([
        "tnp-getgo-dev.web.app",
        "tnp-getgo-stg.web.app",
        "tnp-getgo.web.app",
        "platform.openai.com",
        "youtube.com",
        "www.youtube.com",
        "youtu.be",
      ]);
      const allowedFirebasePaths = [
        "/project/tnp-getgo-dev/",
        "/project/tnp-getgo-stg/",
        "/project/tnp-getgo/",
      ];
      const allowedFirebaseConsole = url.hostname === "console.firebase.google.com" &&
        allowedFirebasePaths.some((prefix) => url.pathname.startsWith(prefix));
      const allowedLocalhost = url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
        url.port === "5173";
      if (
        !allowedLocalhost &&
        (url.protocol !== "https:" || (!allowedHosts.has(url.hostname) && !allowedFirebaseConsole))
      )
        throw new Error("External URL is not allowed");
      await shell.openExternal(url.toString());
    },
  );
  const resolveQuizSource = async (manifestPath: unknown): Promise<string> => {
    if (
      typeof manifestPath !== "string" ||
      !path.isAbsolute(manifestPath) ||
      path.basename(manifestPath) !== "manifest.json"
    ) {
      throw new Error("Invalid quiz manifest path");
    }
    const current = await settings.read();
    if (!current.repositoryPath)
      throw new Error("Choose a quiz repository first.");
    const relative = path.relative(current.repositoryPath, manifestPath);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Quiz is outside the selected repository");
    return path.join(path.dirname(manifestPath), "quiz.ts");
  };
  const repositoryRoot = async (): Promise<string> => {
    const current = await settings.read();
    if (!current.repositoryPath)
      throw new Error("Choose a quiz repository first.");
    return current.repositoryPath;
  };
  const resolveManifest = async (manifestPath: unknown): Promise<string> => {
    await resolveQuizSource(manifestPath);
    return manifestPath as string;
  };
  ipcMain.handle(
    "quiz-asset:read",
    async (_event, manifestPath: unknown, assetReference: unknown) => {
      if (
        typeof manifestPath !== "string" ||
        !path.isAbsolute(manifestPath) ||
        !["manifest.json", "quiz.json"].includes(path.basename(manifestPath))
      )
        throw new Error("Invalid quiz manifest path");
      const current = await settings.read();
      if (!current.repositoryPath)
        throw new Error("Choose a quiz repository first.");
      const manifest = path.resolve(manifestPath);
      const manifestRelative = path.relative(current.repositoryPath, manifest);
      if (manifestRelative.startsWith("..") || path.isAbsolute(manifestRelative))
        throw new Error("Quiz is outside the selected repository");
      if (
        typeof assetReference !== "string" ||
        !assetReference.startsWith("asset:")
      )
        throw new Error("Invalid quiz asset reference");
      const relativeAssetPath = assetReference.slice("asset:".length);
      if (
        !relativeAssetPath ||
        path.isAbsolute(relativeAssetPath) ||
        relativeAssetPath.split(/[\\/]/).includes("..")
      )
        throw new Error("Quiz asset is outside the assets folder");
      const quizDirectory = path.dirname(manifest);
      const assetDirectories = [path.join(quizDirectory, "assets")];
      if (path.basename(manifest) === "quiz.json")
        assetDirectories.push(
          path.join(path.dirname(path.dirname(quizDirectory)), "assets"),
        );
      let assetPath: string | null = null;
      for (const directory of assetDirectories) {
        const candidate = path.resolve(directory, relativeAssetPath);
        const relative = path.relative(directory, candidate);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
          continue;
        if (await fs.access(candidate).then(() => true).catch(() => false)) {
          assetPath = candidate;
          break;
        }
      }
      if (!assetPath) throw new Error(`Could not load ${assetReference}`);
      const extension = path.extname(assetPath).toLowerCase();
      const mimeType = (
        {
          ".avif": "image/avif",
          ".gif": "image/gif",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
        } as Record<string, string>
      )[extension];
      if (!mimeType)
        throw new Error(
          `Unsupported quiz asset type: ${extension || "unknown"}`,
        );
      return `data:${mimeType};base64,${(await fs.readFile(assetPath)).toString("base64")}`;
    },
  );
  ipcMain.handle("quiz-source:read", async (_event, manifestPath: unknown) => {
    return fs.readFile(await resolveQuizSource(manifestPath), "utf8");
  });
  ipcMain.handle(
    "quiz-source:save",
    async (_event, manifestPath: unknown, source: unknown) => {
      if (typeof source !== "string") throw new Error("Invalid quiz source");
      await resolveQuizSource(manifestPath);
      await updateQuizSource(manifestPath as string, source);
      await replaceQuiz(await repositoryRoot(), manifestPath as string);
    },
  );
  ipcMain.handle(
    "quiz-questions:load",
    async (_event, manifestPath: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      const wasLegacy =
        repositorySnapshot?.quizzes.find(
          (item) => item.manifestPath === manifest,
        )?.questionStorageVersion === "legacy";
      const questions = await loadQuizQuestions(manifest);
      if (wasLegacy && questions.length)
        await replaceQuiz(await repositoryRoot(), manifest);
      return questions;
    },
  );
  ipcMain.handle(
    "alphabet-dictionary:load",
    async (_event, manifestPath: unknown) => {
      return loadAlphabetDictionary(await resolveManifest(manifestPath));
    },
  );
  ipcMain.handle(
    "alphabet-dictionary:save",
    async (_event, manifestPath: unknown, value: unknown) =>
      saveAlphabetDictionary(await resolveManifest(manifestPath), value),
  );
  ipcMain.handle(
    "quiz-questions:migrate-legacy",
    async (_event, contestId: unknown) => {
      if (typeof contestId !== "string" || !/^[a-z0-9_-]+$/i.test(contestId))
        throw new Error("Invalid contest ID");
      const root = await repositoryRoot();
      const before = requireSnapshot();
      if (!before.contests.some((contest) => contest.id === contestId))
        throw new Error(`Contest “${contestId}” was not found.`);
      const legacy = before.quizzes.filter(
        (quiz) =>
          quiz.contest === contestId &&
          quiz.questionStorageVersion === "legacy",
      );
      const migratedQuizIds: string[] = [];
      const failures: Array<{ quizId: string; message: string }> = [];
      for (const quiz of legacy) {
        try {
          const questions = await loadQuizQuestions(quiz.manifestPath);
          if (!questions.length)
            throw new Error(
              "No questions could be extracted from raw.ts or raw.json.",
            );
          migratedQuizIds.push(quiz.id);
        } catch (cause) {
          failures.push({
            quizId: quiz.id,
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      for (const quizId of migratedQuizIds) {
        const quiz = before.quizzes.find(
          (item) => item.contest === contestId && item.id === quizId,
        );
        if (quiz) await replaceQuiz(root, quiz.manifestPath);
      }
      return { snapshot: requireSnapshot(), migratedQuizIds, failures };
    },
  );
  ipcMain.handle(
    "quiz-questions:save",
    async (_event, manifestPath: unknown, question: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      if (!question || typeof question !== "object")
        throw new Error("Invalid question");
      const saved = await saveQuizQuestion(
        manifest,
        question as Parameters<typeof saveQuizQuestion>[1],
      );
      await replaceQuiz(await repositoryRoot(), manifest);
      return saved;
    },
  );
  ipcMain.handle(
    "quiz-questions:review-all",
    async (_event, manifestPath: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      return markAllQuizQuestionsReviewed(manifest);
    },
  );
  ipcMain.handle(
    "quiz-questions:create",
    async (_event, manifestPath: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      const question = await createQuizQuestion(manifest);
      const snapshot = await replaceQuiz(await repositoryRoot(), manifest);
      return { question, snapshot };
    },
  );
  ipcMain.handle(
    "quiz-questions:reorder",
    async (_event, manifestPath: unknown, questionNumbers: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      if (
        !Array.isArray(questionNumbers) ||
        questionNumbers.some(
          (value) => typeof value !== "string" || !/^\d+$/.test(value),
        )
      )
        throw new Error("Invalid question order");
      const questions = await reorderQuizQuestions(manifest, questionNumbers);
      const snapshot = await replaceQuiz(await repositoryRoot(), manifest);
      return { questions, snapshot };
    },
  );
  ipcMain.handle(
    "quiz-questions:delete",
    async (_event, manifestPath: unknown, questionNo: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      if (typeof questionNo !== "string" || !/^\d+$/.test(questionNo))
        throw new Error("Invalid question number");
      const questions = await deleteQuizQuestion(manifest, questionNo);
      const snapshot = await replaceQuiz(await repositoryRoot(), manifest);
      return { questions, snapshot };
    },
  );
  ipcMain.handle(
    "quiz-questions:reset",
    async (_event, manifestPath: unknown, question: unknown) => {
      const manifest = await resolveManifest(manifestPath);
      if (!question || typeof question !== "object")
        throw new Error("Invalid question");
      const saved = await resetQuizQuestion(
        manifest,
        question as Parameters<typeof resetQuizQuestion>[1],
      );
      await replaceQuiz(await repositoryRoot(), manifest);
      return saved;
    },
  );
  ipcMain.handle(
    "crud:contest:create",
    async (_event, contestSettings: unknown) => {
      if (!contestSettings || typeof contestSettings !== "object")
        throw new Error("Invalid contest settings");
      const root = await repositoryRoot();
      await createContestDirectory(
        root,
        contestSettings as Parameters<typeof createContestDirectory>[1],
      );
      const contest = await readContestSummary(
        root,
        validateRepositoryId(
          (contestSettings as Parameters<typeof createContestDirectory>[1]).book
            .code,
          "Contest ID",
        ),
      );
      const snapshot = requireSnapshot();
      repositorySnapshot = {
        ...snapshot,
        contests: [...snapshot.contests, contest].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      };
      await acceptCurrentRepositoryStructure(root);
      return repositorySnapshot;
    },
  );
  ipcMain.handle(
    "crud:contest:update",
    async (_event, id: unknown, contestSettings: unknown) => {
      if (
        typeof id !== "string" ||
        !contestSettings ||
        typeof contestSettings !== "object"
      )
        throw new Error("Invalid contest settings");
      const root = await repositoryRoot();
      await updateContestSettings(
        root,
        id,
        contestSettings as Parameters<typeof updateContestSettings>[2],
      );
      const contest = await readContestSummary(root, id);
      const snapshot = requireSnapshot();
      repositorySnapshot = {
        ...snapshot,
        contests: snapshot.contests.map((item) =>
          item.id === id ? contest : item,
        ),
      };
      return repositorySnapshot;
    },
  );
  ipcMain.handle(
    "crud:contest:rename",
    async (_event, currentId: unknown, nextId: unknown) => {
      if (typeof currentId !== "string" || typeof nextId !== "string")
        throw new Error("Invalid contest ID");
      const root = await repositoryRoot();
      await renameContestDirectory(root, currentId, nextId);
      const snapshot = requireSnapshot();
      const current = validateRepositoryId(currentId, "Contest ID");
      const next = validateRepositoryId(nextId, "Contest ID");
      const contest = await readContestSummary(root, next);
      const affected = snapshot.quizzes.filter(
        (item) => item.contest === current,
      );
      repositorySnapshot = {
        ...snapshot,
        contests: snapshot.contests.map((item) =>
          item.id === current ? contest : item,
        ),
        quizzes: snapshot.quizzes.filter((item) => item.contest !== current),
      };
      for (const oldQuiz of affected) {
        await replaceQuiz(
          root,
          path.join(root, "quizzes", next, oldQuiz.id, "manifest.json"),
        );
      }
      return requireSnapshot();
    },
  );
  ipcMain.handle(
    "crud:contest:delete",
    async (_event, requestedId: unknown) => {
      if (typeof requestedId !== "string")
        throw new Error("Invalid contest ID");
      const root = await repositoryRoot();
      const id = validateRepositoryId(requestedId, "Contest ID");
      const directory = path.join(root, "quizzes", id);
      await fs.access(directory);
      await shell.trashItem(directory);
      const snapshot = requireSnapshot();
      repositorySnapshot = {
        ...snapshot,
        contests: snapshot.contests.filter((item) => item.id !== id),
        quizzes: snapshot.quizzes.filter((item) => item.contest !== id),
      };
      await acceptCurrentRepositoryStructure(root);
      return repositorySnapshot;
    },
  );
  ipcMain.handle(
    "crud:quiz:create",
    async (_event, contest: unknown, input: unknown) => {
      if (typeof contest !== "string" || !input || typeof input !== "object")
        throw new Error("Invalid quiz details");
      const root = await repositoryRoot();
      await createQuizFiles(
        root,
        contest,
        input as Parameters<typeof createQuizFiles>[2],
      );
      return replaceQuiz(
        root,
        path.join(
          root,
          "quizzes",
          validateRepositoryId(contest, "Contest ID"),
          validateRepositoryId(
            (input as Parameters<typeof createQuizFiles>[2]).id,
            "Quiz ID",
          ),
          "manifest.json",
        ),
      );
    },
  );
  ipcMain.handle(
    "crud:quiz:update",
    async (_event, manifestPath: unknown, input: unknown) => {
      if (!input || typeof input !== "object")
        throw new Error("Invalid quiz details");
      const manifest = await resolveManifest(manifestPath);
      await updateQuizManifest(
        manifest,
        input as Parameters<typeof updateQuizManifest>[1],
      );
      return replaceQuiz(await repositoryRoot(), manifest);
    },
  );
  ipcMain.handle("crud:quiz:delete", async (_event, manifestPath: unknown) => {
    const root = await repositoryRoot();
    const manifest = await resolveManifest(manifestPath);
    await shell.trashItem(path.dirname(manifest));
    const snapshot = requireSnapshot();
    repositorySnapshot = {
      ...snapshot,
      quizzes: snapshot.quizzes.filter(
        (item) => item.manifestPath !== manifest,
      ),
    };
    await acceptCurrentRepositoryStructure(root);
    return repositorySnapshot;
  });
  startupLog("IPC handlers registered");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
