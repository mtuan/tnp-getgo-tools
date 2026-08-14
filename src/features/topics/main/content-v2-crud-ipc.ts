import path from "node:path";
import { promises as fs } from "node:fs";
import { shell, type IpcMain } from "electron";
import {
  loadContentV2Question,
  loadContentV2Quiz,
  loadContentV2Topic,
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../repository/content-v2-repository.js";
import { parseMarketplaceTopicState } from "./marketplace-sync.js";
import { setContentV2MarketplaceState } from "./content-v2-marketplace-batch.js";

interface Dependencies { repositoryRoot(): Promise<string> }
const idPattern = /^[a-z][a-z0-9-]*$/;

function validId(value: unknown, label: string): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function registerContentV2CrudIpc(ipcMain: IpcMain, { repositoryRoot }: Dependencies): void {
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
    return saveContentV2Quiz(root, await loadContentV2Topic(root, topicId), value);
  });

  ipcMain.handle("content-v2:question:save", async (_event, topicIdValue: unknown, quizIdValue: unknown, value: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const root = await repositoryRoot();
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, topicId),
      loadContentV2Quiz(root, topicId, quizId),
    ]);
    return saveContentV2Question(root, topic, quiz, value);
  });

  ipcMain.handle("content-v2:questions:review-all", async (_event, topicIdValue: unknown, quizIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const root = await repositoryRoot();
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, topicId),
      loadContentV2Quiz(root, topicId, quizId),
    ]);
    const directory = path.join(root, "content-v2", "topics", topicId, "quizzes", quizId, "questions");
    const files = (await fs.readdir(directory, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
    const saved = await Promise.all(files.map(async (entry) => {
      const questionId = entry.name.slice(0, -5);
      const question = await loadContentV2Question(root, topicId, quizId, questionId);
      return question.status === "reviewed"
        ? question
        : saveContentV2Question(root, topic, quiz, { ...question, status: "reviewed" });
    }));
    return { topicId, quizId, reviewed: saved.length };
  });

  ipcMain.handle("content-v2:topic:delete", async (_event, topicIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const directory = path.join(await repositoryRoot(), "content-v2", "topics", topicId);
    await fs.access(path.join(directory, "topic.json"));
    await shell.trashItem(directory);
    return { id: topicId };
  });

  ipcMain.handle("content-v2:quiz:delete", async (_event, topicIdValue: unknown, quizIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const directory = path.join(await repositoryRoot(), "content-v2", "topics", topicId, "quizzes", quizId);
    await fs.access(path.join(directory, "quiz.json"));
    await shell.trashItem(directory);
    return { topicId, id: quizId };
  });

  ipcMain.handle("content-v2:question:delete", async (_event, topicIdValue: unknown, quizIdValue: unknown, questionIdValue: unknown) => {
    const topicId = validId(topicIdValue, "topic ID");
    const quizId = validId(quizIdValue, "quiz ID");
    const questionId = validId(questionIdValue, "question ID");
    const filePath = path.join(await repositoryRoot(), "content-v2", "topics", topicId, "quizzes", quizId, "questions", `${questionId}.json`);
    await fs.access(filePath);
    await shell.trashItem(filePath);
    return { topicId, quizId, id: questionId };
  });
}
