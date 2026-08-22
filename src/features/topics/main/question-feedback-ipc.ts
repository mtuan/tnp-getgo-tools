import type { IpcMain } from "electron";
import type { SyncedQuestionFeedbackStatus } from "../../../shared/domain/models.js";
import {
  loadQuestionFeedback,
  listAllQuestionFeedback,
  listQuestionFeedbackOverview,
  updateQuestionFeedbackReview,
} from "../repository/question-feedback-repository.js";
import type { QuestionFeedbackSyncService } from "./question-feedback-sync.js";

const idPattern = /^[a-z0-9][a-z0-9_-]*$/i;
function id(value: unknown, label: string): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

export function registerQuestionFeedbackIpc(
  ipcMain: IpcMain,
  dependencies: { repositoryRoot(): Promise<string>; sync: QuestionFeedbackSyncService },
): void {
  ipcMain.handle("question-feedback:sync", async () =>
    dependencies.sync.sync(await dependencies.repositoryRoot()));
  ipcMain.handle("question-feedback:list-all", async () =>
    listAllQuestionFeedback(await dependencies.repositoryRoot()));
  ipcMain.handle("question-feedback:overview", async () =>
    listQuestionFeedbackOverview(await dependencies.repositoryRoot()));
  ipcMain.handle("question-feedback:list", async (_event, topicValue: unknown, quizValue: unknown, questionValue: unknown) =>
    loadQuestionFeedback(
      await dependencies.repositoryRoot(),
      id(topicValue, "topic ID"),
      id(quizValue, "quiz ID"),
      id(questionValue, "question ID"),
    ));
  ipcMain.handle("question-feedback:review", async (_event, topicValue: unknown, quizValue: unknown, feedbackValue: unknown, statusValue: unknown, noteValue: unknown) => {
    if (statusValue !== "pending" && statusValue !== "fixed" && statusValue !== "ignored")
      throw new Error("Invalid feedback status.");
    return updateQuestionFeedbackReview(
      await dependencies.repositoryRoot(),
      id(topicValue, "topic ID"),
      id(quizValue, "quiz ID"),
      id(feedbackValue, "feedback ID"),
      statusValue as SyncedQuestionFeedbackStatus,
      typeof noteValue === "string" ? noteValue : undefined,
    );
  });
}
