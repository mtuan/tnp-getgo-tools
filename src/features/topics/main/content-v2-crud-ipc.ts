import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shell, type IpcMain } from "electron";
import {
  loadContentV2Quiz,
  loadContentV2Topic,
  reconcileContentV2GuestPreview,
  resolveContentV2QuizSourcePdf,
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../repository/content-v2-repository.js";
import { reviewAllContentV2Questions } from "../repository/content-v2-question-review.js";
import { parseMarketplaceTopicState } from "./marketplace-sync.js";
import { setContentV2MarketplaceState } from "./content-v2-marketplace-batch.js";
import { contentTopicsRoot } from "../repository/content-source.js";
import { withQuestionAssetDimensions } from "./question-asset-dimensions.js";

interface Dependencies { repositoryRoot(): Promise<string> }
const idPattern = /^[a-z][a-z0-9_-]*$/;

function validId(value: unknown, label: string): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function registerContentV2CrudIpc(ipcMain: IpcMain, { repositoryRoot }: Dependencies): void {
  ipcMain.handle("content-v2:source:open", async (_event, srcValue: unknown, ownerPathValue: unknown) => {
    if (typeof srcValue !== "string" || !srcValue.trim() || srcValue.length > 8192)
      throw new Error("Invalid content source.");
    if (typeof ownerPathValue !== "string" || !path.isAbsolute(ownerPathValue))
      throw new Error("Invalid content file path.");
    const root = await repositoryRoot();
    const ownerRelative = path.relative(root, ownerPathValue);
    if (ownerRelative.startsWith("..") || path.isAbsolute(ownerRelative))
      throw new Error("Content file is outside the selected repository.");
    const src = srcValue.trim();
    let parsed: URL | undefined;
    try { parsed = new URL(src); } catch { /* Local filesystem path. */ }
    if (parsed?.protocol === "http:" || parsed?.protocol === "https:") {
      await shell.openExternal(parsed.toString());
      return;
    }
    if (parsed && parsed.protocol !== "file:")
      throw new Error(`Unsupported source protocol “${parsed.protocol}”.`);
    const sourcePath = parsed
      ? fileURLToPath(parsed)
      : path.isAbsolute(src) ? path.normalize(src) : path.resolve(path.dirname(ownerPathValue), src);
    await fs.access(sourcePath).catch(() => { throw new Error(`Source file does not exist: ${sourcePath}`); });
    const error = await shell.openPath(sourcePath);
    if (error) throw new Error(error);
  });

  ipcMain.handle("content-v2:quiz:source-pdf:open", async (_event, manifestPathValue: unknown) => {
    if (typeof manifestPathValue !== "string" || !path.isAbsolute(manifestPathValue) || !["manifest.json", "quiz.json"].includes(path.basename(manifestPathValue)))
      throw new Error("Invalid quiz path.");
    const root = await repositoryRoot();
    const repositoryRelative = path.relative(root, manifestPathValue);
    if (repositoryRelative.startsWith("..") || path.isAbsolute(repositoryRelative))
      throw new Error("Quiz is outside the selected repository.");
    if (path.basename(manifestPathValue) === "manifest.json") {
      const sourcePdf = path.join(path.dirname(manifestPathValue), "source.pdf");
      await fs.access(sourcePdf).catch(() => { throw new Error("This quiz does not have a source PDF."); });
      const error = await shell.openPath(sourcePdf);
      if (error) throw new Error(error);
      return;
    }
    const relative = path.relative(contentTopicsRoot(root), manifestPathValue);
    const parts = relative.split(path.sep);
    if (relative.startsWith("..") || path.isAbsolute(relative) || parts.length !== 4 || parts[1] !== "quizzes" || parts[3] !== "quiz.json")
      throw new Error("Quiz is outside the selected repository.");
    const sourcePdf = await resolveContentV2QuizSourcePdf(root, validId(parts[0], "topic ID"), validId(parts[2], "quiz ID"));
    if (!sourcePdf) throw new Error("This quiz does not have a source PDF.");
    const error = await shell.openPath(sourcePdf);
    if (error) throw new Error(error);
  });

  ipcMain.handle("content-v2:topic:save", async (_event, value: unknown) =>
    saveContentV2Topic(await repositoryRoot(), value));

  ipcMain.handle("content-v2:marketplace-state:set", async (_event, target: unknown, ids: unknown, stateValue: unknown, topicIdValue: unknown) => {
    if (target !== "topics" && target !== "quizzes") throw new Error("Invalid marketplace batch target.");
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && idPattern.test(id)))
      throw new Error("Invalid marketplace batch IDs.");
    return setContentV2MarketplaceState({
      root: await repositoryRoot(),
      target,
      ids,
      state: parseMarketplaceTopicState(stateValue),
      ...(typeof topicIdValue === "string" ? { topicId: validId(topicIdValue, "topic ID") } : {}),
    });
  });

  ipcMain.handle("content-v2:quiz:save", async (_event, topicIdValue: unknown, value: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const root = await repositoryRoot();
    const saved = await saveContentV2Quiz(root, await loadContentV2Topic(root, topicId), value);
    await reconcileContentV2GuestPreview(
      root,
      topicId,
      saved.marketplace?.preview === true ? saved.id : undefined,
    );
    return saved;
  });

  ipcMain.handle("content-v2:question:save", async (_event, topicIdValue: unknown, quizIdValue: unknown, value: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const root = await repositoryRoot();
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, topicId),
      loadContentV2Quiz(root, topicId, quizId),
    ]);
    const saved = await saveContentV2Question(root, topic, quiz,
      await withQuestionAssetDimensions(root, topicId, quizId, value));
    await reconcileContentV2GuestPreview(root, topicId);
    return saved;
  });

  ipcMain.handle("content-v2:questions:review-all", async (_event, topicIdValue: unknown, quizIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const root = await repositoryRoot();
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, topicId),
      loadContentV2Quiz(root, topicId, quizId),
    ]);
    const result = await reviewAllContentV2Questions(root, topic, quiz);
    await reconcileContentV2GuestPreview(root, topicId);
    return { topicId, quizId, ...result };
  });

  ipcMain.handle("content-v2:topic:delete", async (_event, topicIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const directory = path.join(contentTopicsRoot(await repositoryRoot()), topicId);
    await fs.access(path.join(directory, "topic.json"));
    await shell.trashItem(directory);
    return { id: topicId };
  });

  ipcMain.handle("content-v2:quiz:delete", async (_event, topicIdValue: unknown, quizIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const root = await repositoryRoot();
    const directory = path.join(contentTopicsRoot(root), topicId, "quizzes", quizId);
    await fs.access(path.join(directory, "quiz.json"));
    await shell.trashItem(directory);
    await reconcileContentV2GuestPreview(root, topicId);
    return { topicId, id: quizId };
  });

  ipcMain.handle("content-v2:question:delete", async (_event, topicIdValue: unknown, quizIdValue: unknown, questionIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const questionId = validId(questionIdValue, "question ID");
    const filePath = path.join(contentTopicsRoot(await repositoryRoot()), topicId, "quizzes", quizId, "questions", `${questionId}.json`);
    await fs.access(filePath);
    await shell.trashItem(filePath);
    return { topicId, quizId, id: questionId };
  });
}
