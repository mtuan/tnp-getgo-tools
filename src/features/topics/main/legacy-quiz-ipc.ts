import { promises as fs } from "node:fs";
import path from "node:path";
import { shell, type IpcMain } from "electron";
import type { RepositoryViewData } from "../../../shared/domain/models.js";
import type { SettingsStore } from "../../settings/main/settings.js";
import { createContestDirectory, createQuizFiles, renameContestDirectory, updateContestSettings, updateQuizManifest, updateQuizSource, validateRepositoryId } from "../repository/quiz-crud.js";
import { createQuizQuestion, deleteQuizQuestion, loadQuizQuestions, markAllQuizQuestionsReviewed, quizQuestionFile, reorderQuizQuestions, resetQuizQuestion, saveQuizQuestion } from "../../quiz-editor/repository/quiz-questions.js";
import { loadAlphabetDictionary, saveAlphabetDictionary } from "../../quiz-editor/repository/alphabet-dictionary.js";
import { registerResourceLinksIpc } from "./resource-links-ipc.js";

interface Dependencies {
  settings: SettingsStore;
  loadLegacyFiles(): Promise<RepositoryViewData>;
  replaceQuiz(root: string, manifestPath: string): Promise<RepositoryViewData>;
}

export function registerLegacyQuizIpc(
  ipcMain: IpcMain,
  { settings, loadLegacyFiles, replaceQuiz }: Dependencies,
): void {
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
registerResourceLinksIpc(ipcMain);
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
    if (
      manifestRelative.startsWith("..") ||
      path.isAbsolute(manifestRelative)
    )
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
      if (
        await fs
          .access(candidate)
          .then(() => true)
          .catch(() => false)
      ) {
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
ipcMain.handle(
  "quiz-asset:save",
  async (
    _event,
    manifestPath: unknown,
    suggestedName: unknown,
    dataUrl: unknown,
  ) => {
    if (typeof manifestPath !== "string" || !path.isAbsolute(manifestPath))
      throw new Error("Invalid quiz manifest path");
    if (typeof suggestedName !== "string" || !suggestedName.trim())
      throw new Error("Invalid asset filename");
    if (typeof dataUrl !== "string") throw new Error("Invalid image data");
    const current = await settings.read();
    if (!current.repositoryPath)
      throw new Error("Choose a quiz repository first.");
    const manifest = path.resolve(manifestPath);
    const manifestRelative = path.relative(current.repositoryPath, manifest);
    if (
      manifestRelative.startsWith("..") ||
      path.isAbsolute(manifestRelative)
    )
      throw new Error("Quiz is outside the selected repository");
    const match =
      /^data:(image\/(?:avif|gif|jpeg|png|svg\+xml|webp));base64,([\s\S]+)$/.exec(
        dataUrl,
      );
    if (!match) throw new Error("Paste or select a supported image file.");
    const extensions: Record<string, string> = {
      "image/avif": "avif",
      "image/gif": "gif",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/svg+xml": "svg",
      "image/webp": "webp",
    };
    const stem = path
      .basename(suggestedName, path.extname(suggestedName))
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!stem) throw new Error("Invalid asset filename");
    const filename = `${stem}.${extensions[match[1]]}`;
    const assetsDirectory = path.join(path.dirname(manifest), "assets");
    await fs.mkdir(assetsDirectory, { recursive: true });
    await fs.writeFile(
      path.join(assetsDirectory, filename),
      Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    );
return { reference: `asset:${filename}`, preview: dataUrl };
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
      (await loadLegacyFiles()).quizzes.find(
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
    const before = await loadLegacyFiles();
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
    return { snapshot: await loadLegacyFiles(), migratedQuizIds, failures };
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
    return loadLegacyFiles();
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
    return loadLegacyFiles();
  },
);
ipcMain.handle(
  "crud:contest:rename",
  async (_event, currentId: unknown, nextId: unknown) => {
    if (typeof currentId !== "string" || typeof nextId !== "string")
      throw new Error("Invalid contest ID");
    const root = await repositoryRoot();
    await renameContestDirectory(root, currentId, nextId);
    return loadLegacyFiles();
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
    return loadLegacyFiles();
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
  return loadLegacyFiles();
});
}
