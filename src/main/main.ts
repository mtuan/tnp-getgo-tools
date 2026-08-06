import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from "electron";
import { config as loadEnvironment } from "dotenv";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppSettings, RepositorySnapshot } from "../core/models.js";
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
  quizQuestionFile,
  reorderQuizQuestions,
  resetQuizQuestion,
  saveQuizQuestion,
} from "../repositories/quiz-questions.js";
import { loadAlphabetDictionary } from "../repositories/alphabet-dictionary.js";
import { withSpeechLanguageSettings } from "../core/speech-settings.js";
import type { SpeechLanguage, SpeechLanguageSettings } from "../core/models.js";
import {
  createPublishPayloadFromQuestions,
  recordPublishedHash,
  type LocalPublishPayload,
} from "../repositories/quiz-publishing.js";
import { SettingsStore } from "./settings.js";
import { FirebaseAuthService } from "./firebase-auth.js";
import { LocalAiService } from "./local-ai.js";
import { AiMigrationJobManager } from "./ai-migration-jobs.js";
import { FirestorePublishingService } from "./firestore-publishing.js";

loadEnvironment({
  path: app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(app.getAppPath(), ".env"),
});

const productName = "GetGo Tools";
app.setName(productName);
process.title = productName;

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = app.isPackaged
  ? path.join(currentDirectory, "../renderer/icons/getgo-app-icon.png")
  : path.join(app.getAppPath(), "src/renderer/public/icons/getgo-app-icon.png");
let mainWindow: BrowserWindow | null = null;
let firebaseAuth: FirebaseAuthService | null = null;

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
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void mainWindow.loadURL(devUrl);
  else
    void mainWindow.loadFile(
      path.join(currentDirectory, "../renderer/index.html"),
    );
}

app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock?.setIcon(appIconPath);
  const settings = new SettingsStore(app.getPath("userData"));
  let repositorySnapshot: RepositorySnapshot | null = null;
  let repositoryScanPromise: Promise<RepositorySnapshot> | null = null;
  let repositoryScanPath: string | null = null;
  const publishPayloads = new Map<string, LocalPublishPayload>();
  const scanRepository = async (
    repositoryPath: string,
    options?: Parameters<typeof scanQuizRepository>[1],
    force = false,
  ) => {
    const resolved = path.resolve(repositoryPath);
    if (!force && repositorySnapshot?.repositoryPath === resolved)
      return repositorySnapshot;
    if (repositoryScanPromise) {
      if (!force && repositoryScanPath === resolved)
        return repositoryScanPromise;
      await repositoryScanPromise;
      return scanRepository(resolved, options, force);
    }
    repositoryScanPath = resolved;
    repositoryScanPromise = (async () => {
      const nextPayloads = new Map<string, LocalPublishPayload>();
      const next = await scanQuizRepository(resolved, {
        ...options,
        onQuizQuestions: (quiz, records) => {
          if (!records.length) return;
          try {
            nextPayloads.set(
              quiz.key,
              createPublishPayloadFromQuestions(quiz, records),
            );
          } catch {
            /* The snapshot keeps the local error for the publishing page. */
          }
        },
      });
      publishPayloads.clear();
      for (const [key, payload] of nextPayloads)
        publishPayloads.set(key, payload);
      repositorySnapshot = next;
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
    let payload: LocalPublishPayload | null = null;
    const quiz = await readQuizSummary(
      root,
      manifestPath,
      (summary, records) => {
        if (records.length) {
          try {
            payload = createPublishPayloadFromQuestions(summary, records);
          } catch {
            payload = null;
          }
        }
      },
    );
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
    if (payload) publishPayloads.set(quiz.key, payload);
    else publishPayloads.delete(quiz.key);
    return repositorySnapshot;
  };
  const initialSettings = await settings.read();
  if (initialSettings.repositoryPath) {
    try {
      await scanRepository(initialSettings.repositoryPath);
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
  ipcMain.handle("app:restart", () => {
    if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
      mainWindow?.reload();
      return;
    }
    app.relaunch();
    app.exit(0);
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
      const payload = publishPayloads.get(quiz.key);
      if (!payload)
        throw new Error(
          "This quiz has no valid cached question data to publish.",
        );
      const result = await publishing.publish(quiz, payload);
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
  ipcMain.handle(
    "shell:open-external",
    async (_event, requestedUrl: unknown) => {
      if (typeof requestedUrl !== "string") throw new Error("Invalid URL");
      const url = new URL(requestedUrl);
      if (
        url.protocol !== "https:" ||
        !["tnp-getgo.web.app", "platform.openai.com"].includes(url.hostname)
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
      const manifest = await resolveManifest(manifestPath);
      if (
        typeof assetReference !== "string" ||
        !assetReference.startsWith("asset:")
      )
        throw new Error("Invalid quiz asset reference");
      const relativeAssetPath = assetReference.slice("asset:".length);
      const assetsDirectory = path.join(path.dirname(manifest), "assets");
      const assetPath = path.resolve(assetsDirectory, relativeAssetPath);
      const relative = path.relative(assetsDirectory, assetPath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Quiz asset is outside the assets folder");
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
        publishPayloads.delete(oldQuiz.key);
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
      for (const quiz of snapshot.quizzes.filter((item) => item.contest === id))
        publishPayloads.delete(quiz.key);
      repositorySnapshot = {
        ...snapshot,
        contests: snapshot.contests.filter((item) => item.id !== id),
        quizzes: snapshot.quizzes.filter((item) => item.contest !== id),
      };
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
    const manifest = await resolveManifest(manifestPath);
    await shell.trashItem(path.dirname(manifest));
    const snapshot = requireSnapshot();
    const removed = snapshot.quizzes.find(
      (item) => item.manifestPath === manifest,
    );
    if (removed) publishPayloads.delete(removed.key);
    repositorySnapshot = {
      ...snapshot,
      quizzes: snapshot.quizzes.filter(
        (item) => item.manifestPath !== manifest,
      ),
    };
    return repositorySnapshot;
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
