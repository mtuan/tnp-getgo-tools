import { promises as fs } from "node:fs";
import path from "node:path";
import { dialog, shell, type BrowserWindow, type IpcMain } from "electron";
import type { RepositorySnapshot } from "../../../shared/domain/models.js";
import { hashContentV2, sanitizeMarketplaceTopic, withMarketplaceTopicState } from "../domain/content-v2.js";
import { clearContentV2Published, loadContentV2Question, loadContentV2Quiz, loadContentV2QuizResources, loadContentV2Topic, loadContentV2TopicDictionary, readContentV2QuizPublishState, saveContentV2QuizDictionary, saveContentV2Topic, saveContentV2TopicDictionary, writeContentV2QuizPublishState } from "../repository/content-v2-repository.js";
import { localizedAlphabetDictionary } from "../../quiz-editor/repository/alphabet-dictionary.js";
import { parseMarketplaceTopicState, syncedMarketplaceMetadata, syncMarketplaceTopic } from "./marketplace-sync.js";
import { syncAllMarketplaceTopics } from "./marketplace-sync-all.js";
import type { FirestorePublishingService } from "./firestore-publishing.js";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { PublishJobManager } from "../../jobs/main/publish-jobs.js";

interface SnapshotState { value: RepositorySnapshot | null }
interface Dependencies {
  mainWindow: BrowserWindow;
  snapshotState: SnapshotState;
  requireSnapshot(): RepositorySnapshot;
  repositoryRoot(): Promise<string>;
  publishing: FirestorePublishingService;
  publishJobs: PublishJobManager;
  backgroundJobsSnapshot(): unknown;
  firebaseAuth: FirebaseAuthService;
}

export function registerTopicResourcesIpc(ipcMain: IpcMain, { mainWindow, snapshotState, requireSnapshot, repositoryRoot, publishing, publishJobs, backgroundJobsSnapshot, firebaseAuth }: Dependencies): void {
ipcMain.handle(
  "marketplace:topics:publish",
  async (_event, topicId: unknown, state: unknown) => {
    if (typeof topicId !== "string" || !/^[a-z][a-z0-9-]*$/.test(topicId))
      throw new Error("Invalid marketplace topic ID.");
    const marketplaceState = parseMarketplaceTopicState(state);
    const root = await repositoryRoot();
    const snapshot = requireSnapshot();
    const summary = snapshot.contentV2.topics.find(
      (item) => item.id === topicId,
    );
    if (!summary) throw new Error("The selected topic was not found.");
    if (marketplaceState !== "unlisted" && !summary.publishedAt)
      throw new Error(
        "Publish this topic from its Publish tab before adding it to the marketplace.",
      );
    if (!firebaseAuth) throw new Error("Publishing is not initialized.");
    if (marketplaceState !== "unlisted" && !(await publishing.contentV2TopicExists(topicId)))
      throw new Error(
        "This topic is not published in the selected environment.",
      );

    const existing = await loadContentV2Topic(root, topicId);
    const topic = {
      ...existing,
      marketplace: withMarketplaceTopicState(existing.marketplace, marketplaceState),
    };
    const saved = await saveContentV2Topic(root, topic);
    const contentHash = hashContentV2(sanitizeMarketplaceTopic(saved));
    return publishJobs.track(
      {
        name: `${marketplaceState === "unlisted" ? "Remove" : "Sync"} marketplace topic · ${summary.title}`,
        description: marketplaceState === "unlisted"
          ? "Remove the marketplace document and topic learning data"
          : `Synchronize the marketplace document as ${marketplaceState}`,
        route: `/topics/${encodeURIComponent(topicId)}?tab=marketplace`,
      },
      async (control) => {
        if (marketplaceState === "unlisted") {
          await control.setTotal(1, "Removing marketplace and topic data");
          const topicQuizzes = snapshot.contentV2.quizzes.filter((item) => item.topicId === topicId);
          const target = await firebaseAuth.publishingTarget();
          for (const quiz of topicQuizzes) {
            const publishState = await readContentV2QuizPublishState(quiz.filePath);
            await publishing.removeContentV2StorageItems(publishState.targets[target.projectId], control);
            await clearContentV2Published(quiz.filePath);
            await writeContentV2QuizPublishState(quiz.filePath, { schemaVersion: 1, targets: {} });
          }
          await publishing.removeContentV2Topic(topicId, control);
          await clearContentV2Published(summary.filePath);
          const result = { contentHash, publishedAt: new Date().toISOString() };
          const marketplace = syncedMarketplaceMetadata(saved.marketplace, marketplaceState, result);
          await saveContentV2Topic(root, { ...saved, marketplace });
          const current = requireSnapshot();
          snapshotState.value = { ...current, contentV2: { ...current.contentV2,
            topics: current.contentV2.topics.map((item) => item.id === topicId ? { ...item, publishedHash: null, publishedAt: null, marketplace, marketplaceLocalHash: contentHash, marketplacePublishedHash: null, marketplacePublishedAt: null } : item),
            quizzes: current.contentV2.quizzes.map((item) => item.topicId === topicId ? { ...item, publishedHash: null, publishedAt: null } : item),
          } };
          await control.advance("Removed marketplace and topic data");
          return { topicId, state: marketplaceState, contentHash, publishedAt: result.publishedAt, snapshot: requireSnapshot() };
        }
        await control.setTotal(
          1,
          "Synchronizing marketplace listing",
        );
        const result = await syncMarketplaceTopic(
          publishing,
          saved,
          contentHash,
          marketplaceState,
        );
        const marketplace = syncedMarketplaceMetadata(
          saved.marketplace, marketplaceState, result,
        );
        await saveContentV2Topic(root, { ...saved, marketplace });
        await control.advance(
          "Synchronized marketplace document",
        );
        const current = requireSnapshot();
        snapshotState.value = {
          ...current,
          contentV2: {
            ...current.contentV2,
            topics: current.contentV2.topics.map((item) =>
              item.id === topicId
                ? {
                    ...item,
                    marketplace,
                    marketplaceLocalHash: contentHash,
                    marketplacePublishedHash: result.contentHash,
                    marketplacePublishedAt: result.publishedAt,
                  }
                : item,
            ),
          },
        };
        return {
          topicId,
          state: marketplaceState,
          contentHash: result.contentHash,
          publishedAt: result.publishedAt,
          snapshot: requireSnapshot(),
        };
      },
    );
  },
);
ipcMain.handle("marketplace:topics:sync-all", async () => {
  const active = (await publishJobs.list()).find((job) => job.name === "Sync marketplace · All topics" && ["queued", "running", "paused"].includes(job.status));
  if (active) return backgroundJobsSnapshot();
  const root = await repositoryRoot(), snapshot = requireSnapshot();
  if (!firebaseAuth) throw new Error("Publishing is not initialized.");
  await publishJobs.start({ name: "Sync marketplace · All topics", description: "Synchronize local topics, quizzes, questions, resources, assets, and marketplace states", route: "/topics" }, async (control) => {
    snapshotState.value = await syncAllMarketplaceTopics(root, snapshot, publishing, firebaseAuth, control);
  });
  return backgroundJobsSnapshot();
});
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
    if (quiz.type !== "alphabet" && quiz.type !== "spelling")
      return resources;
    return {
      ...resources,
      dictionary: localizedAlphabetDictionary(
        resources.dictionary as Parameters<
          typeof localizedAlphabetDictionary
        >[0],
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
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        quizzes: current.contentV2.quizzes.map((item) =>
          item.topicId === topicId ? { ...item, localHash: "" } : item,
        ),
      },
    };
    return requireSnapshot();
  },
);
ipcMain.handle(
  "content-v2:topic:dictionary:load",
  async (_event, topicId: unknown) => {
    if (typeof topicId !== "string")
      throw new Error("Invalid topic selection.");
    return loadContentV2TopicDictionary(await repositoryRoot(), topicId);
  },
);
ipcMain.handle(
  "content-v2:topic:dictionary:save",
  async (_event, topicId: unknown, value: unknown) => {
    if (typeof topicId !== "string")
      throw new Error("Invalid topic selection.");
    const root = await repositoryRoot();
    await saveContentV2TopicDictionary(root, topicId, value);
    const current = requireSnapshot();
    snapshotState.value = {
      ...current,
      contentV2: {
        ...current.contentV2,
        quizzes: current.contentV2.quizzes.map((item) =>
          item.topicId === topicId ? { ...item, localHash: "" } : item,
        ),
      },
    };
    return requireSnapshot();
  },
);
const topicAssetsDirectory = async (topicId: unknown) => {
  if (typeof topicId !== "string" || !/^[a-z][a-z0-9-]*$/.test(topicId))
    throw new Error("Invalid topic selection.");
  return path.join(
    await repositoryRoot(),
    "content-v2",
    "topics",
    topicId,
    "assets",
  );
};
const listTopicAssets = async (topicId: unknown) => {
  const directory = await topicAssetsDirectory(topicId);
  await fs.mkdir(directory, { recursive: true });
  const supported: Record<string, string> = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  const files: string[] = [];
  const visit = async (current: string) => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (
        entry.isFile() &&
        supported[path.extname(entry.name).toLowerCase()]
      )
        files.push(
          path.relative(directory, absolute).replaceAll(path.sep, "/"),
        );
    }
  };
  await visit(directory);
  const assets = await Promise.all(
    files.map(async (filename) => ({
      filename,
      size: (await fs.stat(path.join(directory, filename))).size,
      mimeType: supported[path.extname(filename).toLowerCase()]!,
    })),
  );
  return assets.sort((left, right) =>
    left.filename.localeCompare(right.filename),
  );
};
ipcMain.handle("content-v2:topic:assets:list", (_event, topicId: unknown) =>
  listTopicAssets(topicId),
);
ipcMain.handle(
  "content-v2:topic:asset:read",
  async (_event, topicId: unknown, filename: unknown) => {
    if (
      typeof filename !== "string" ||
      path.isAbsolute(filename) ||
      filename
        .split(/[\\/]/)
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Invalid asset selection.");
    const directory = await topicAssetsDirectory(topicId);
    const assetPath = path.resolve(directory, filename);
    if (!assetPath.startsWith(`${path.resolve(directory)}${path.sep}`))
      throw new Error("Invalid asset selection.");
    const mimeTypes: Record<string, string> = {
      ".avif": "image/avif",
      ".gif": "image/gif",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
    };
    const mimeType = mimeTypes[path.extname(assetPath).toLowerCase()];
    if (
      !mimeType ||
      !(await fs
        .stat(assetPath)
        .then((value) => value.isFile())
        .catch(() => false))
    )
      throw new Error("The selected asset was not found.");
    return `data:${mimeType};base64,${(await fs.readFile(assetPath)).toString("base64")}`;
  },
);
ipcMain.handle(
  "content-v2:topic:assets:import",
  async (_event, topicId: unknown) => {
    const directory = await topicAssetsDirectory(topicId);
    const selection = await dialog.showOpenDialog(mainWindow!, {
      title: "Import shared topic assets",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Images",
          extensions: ["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"],
        },
      ],
    });
    if (selection.canceled) return listTopicAssets(topicId);
    const existing = new Set(
      (await listTopicAssets(topicId)).map((item) => item.filename),
    );
    const duplicates = selection.filePaths
      .map((file) => path.basename(file))
      .filter((name) => existing.has(name));
    if (duplicates.length)
      throw new Error(`Already exists: ${duplicates.join(", ")}`);
    await Promise.all(
      selection.filePaths.map((file) =>
        fs.copyFile(file, path.join(directory, path.basename(file))),
      ),
    );
return listTopicAssets(topicId);
  },
);
ipcMain.handle(
  "content-v2:topic:asset:trash",
  async (_event, topicId: unknown, filename: unknown) => {
    if (
      typeof filename !== "string" ||
      path.isAbsolute(filename) ||
      filename
        .split(/[\\/]/)
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error("Invalid asset selection.");
    const dictionary = await loadContentV2TopicDictionary(
      await repositoryRoot(),
      String(topicId),
    );
    if (JSON.stringify(dictionary).includes(`asset:${filename}`))
      throw new Error(
        "This asset is still referenced by the shared dictionary.",
      );
    const root = await repositoryRoot();
    const referencingQuestion = (
      await Promise.all(
        requireSnapshot()
          .contentV2.questions.filter(
            (question) => question.topicId === topicId,
          )
          .map((question) =>
            loadContentV2Question(
              root,
              question.topicId,
              question.quizId,
              question.id,
            ),
          ),
      )
    ).some((question) =>
      JSON.stringify(question).includes(`asset:${filename}`),
    );
    if (referencingQuestion)
      throw new Error("This asset is still referenced by a quiz question.");
    const assetsDirectory = await topicAssetsDirectory(topicId);
    const assetPath = path.resolve(assetsDirectory, filename);
    if (!assetPath.startsWith(`${path.resolve(assetsDirectory)}${path.sep}`))
      throw new Error("Invalid asset selection.");
    await shell.trashItem(assetPath);
return listTopicAssets(topicId);
  },
);
ipcMain.handle(
  "content-v2:topic:assets:show",
  async (_event, topicId: unknown) => {
    await shell.openPath(await topicAssetsDirectory(topicId));
  },
);

}
