import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  SyncedQuestionFeedback,
  SyncedQuestionFeedbackStatus,
  QuestionFeedbackOverview,
} from "../../../shared/domain/models.js";

const idPattern = /^[a-z0-9][a-z0-9_-]*$/i;
export const feedbackCursorSchemaVersion = 2;

export type FeedbackCursor = {
  schemaVersion?: number;
  reportedAt: string;
  documentName: string;
};

function validId(value: string, label: string): string {
  if (!idPattern.test(value)) throw new Error(`Invalid ${label}.`);
  return value;
}

function feedbackDirectory(root: string, topicId: string, quizId: string): string {
  return path.join(
    path.resolve(root),
    "content-v2",
    "topics",
    validId(topicId, "topic ID"),
    "quizzes",
    validId(quizId, "quiz ID"),
    "feedback",
  );
}

function feedbackPath(root: string, topicId: string, quizId: string, feedbackId: string): string {
  return path.join(feedbackDirectory(root, topicId, quizId), `${validId(feedbackId, "feedback ID")}.json`);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

export async function saveSyncedQuestionFeedback(
  root: string,
  feedback: SyncedQuestionFeedback,
): Promise<boolean> {
  const filePath = feedbackPath(root, feedback.source.topicId, feedback.source.quizId, feedback.id);
  try {
    await fs.access(filePath);
    return false;
  } catch {
    await writeJson(filePath, feedback);
    return true;
  }
}

export async function hasFeedbackTarget(root: string, topicId: string, quizId: string): Promise<boolean> {
  try {
    await fs.access(path.join(feedbackDirectory(root, topicId, quizId), "..", "quiz.json"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Legacy reports did not include topicId. Resolve those reports from directory
 * names only and only during feedback sync; never load topic or question files.
 */
export async function findLegacyFeedbackTopic(root: string, quizId: string): Promise<string | null> {
  const topicsRoot = path.join(path.resolve(root), "content-v2", "topics");
  let topics: import("node:fs").Dirent[];
  try {
    topics = await fs.readdir(topicsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const matches: string[] = [];
  for (const topic of topics) {
    if (!topic.isDirectory()) continue;
    try {
      await fs.access(path.join(topicsRoot, topic.name, "quizzes", validId(quizId, "quiz ID"), "quiz.json"));
      matches.push(topic.name);
      if (matches.length > 1) return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return matches[0] ?? null;
}

export async function loadQuestionFeedback(
  root: string,
  topicId: string,
  quizId: string,
  questionId: string,
): Promise<SyncedQuestionFeedback[]> {
  const directory = feedbackDirectory(root, topicId, quizId);
  let names: string[];
  try {
    names = await fs.readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) =>
    JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as SyncedQuestionFeedback));
  return records
    .filter((record) => record.source.questionId === questionId)
    .sort((left, right) => right.source.reportedAt.localeCompare(left.source.reportedAt));
}

export async function listAllQuestionFeedback(root: string): Promise<SyncedQuestionFeedback[]> {
  const startedAt = performance.now();
  const topicsRoot = path.join(path.resolve(root), "content-v2", "topics");
  const records: SyncedQuestionFeedback[] = [];
  let topicEntries: import("node:fs").Dirent[] = [];
  try { topicEntries = await fs.readdir(topicsRoot, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return records;
    throw error;
  }
  for (const topic of topicEntries) {
    if (!topic.isDirectory()) continue;
    const quizzesRoot = path.join(topicsRoot, topic.name, "quizzes");
    let quizzes: import("node:fs").Dirent[] = [];
    try { quizzes = await fs.readdir(quizzesRoot, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const quiz of quizzes) {
      if (!quiz.isDirectory()) continue;
      const directory = path.join(quizzesRoot, quiz.name, "feedback");
      let names: string[] = [];
      try { names = await fs.readdir(directory); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const loaded = await Promise.all(names.filter((name) => name.endsWith(".json")).map(async (name) =>
        JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) as SyncedQuestionFeedback));
      records.push(...loaded);
    }
  }
  console.info("[GetGo Tools][Question feedback] Local inbox loaded", {
    reports: records.length,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return records.sort((left, right) => right.source.reportedAt.localeCompare(left.source.reportedAt));
}

function displayText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(" ");
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (record.en !== undefined || record.vi !== undefined)
    return displayText(record.en) || displayText(record.vi);
  if (record.value !== undefined) return displayText(record.value);
  if (record.text !== undefined) return displayText(record.text);
  return "";
}

async function readDisplayFile(filePath: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function listQuestionFeedbackOverview(root: string): Promise<QuestionFeedbackOverview[]> {
  const reports = await listAllQuestionFeedback(root);
  const grouped = new Map<string, SyncedQuestionFeedback[]>();
  for (const report of reports) {
    const key = `${report.source.topicId}/${report.source.quizId}/${report.source.questionId}`;
    grouped.set(key, [...(grouped.get(key) ?? []), report]);
  }
  const topicsRoot = path.join(path.resolve(root), "content-v2", "topics");
  const pendingGroups = Array.from(grouped).filter(([, items]) =>
    items.some((item) => item.review.status === "pending"));
  return Promise.all(pendingGroups.map(async ([key, items]) => {
    const { topicId, quizId, questionId } = items[0]!.source;
    const topicRoot = path.join(topicsRoot, validId(topicId, "topic ID"));
    const quizRoot = path.join(topicRoot, "quizzes", validId(quizId, "quiz ID"));
    const [topic, quiz, question] = await Promise.all([
      readDisplayFile(path.join(topicRoot, "topic.json")),
      readDisplayFile(path.join(quizRoot, "quiz.json")),
      readDisplayFile(path.join(quizRoot, "questions", `${validId(questionId, "question ID")}.json`)),
    ]);
    return {
      key,
      topicId,
      topicTitle: displayText(topic.title) || topicId,
      quizId,
      quizTitle: displayText(quiz.title) || quizId,
      questionId,
      questionText: displayText(question.text) || `Question ${questionId.replace(/^q/i, "")}`,
      reports: items,
    };
  }));
}

export async function updateQuestionFeedbackReview(
  root: string,
  topicId: string,
  quizId: string,
  feedbackId: string,
  status: SyncedQuestionFeedbackStatus,
  note?: string,
): Promise<SyncedQuestionFeedback> {
  const filePath = feedbackPath(root, topicId, quizId, feedbackId);
  const current = JSON.parse(await fs.readFile(filePath, "utf8")) as SyncedQuestionFeedback;
  const next: SyncedQuestionFeedback = {
    ...current,
    review: {
      status,
      note: note?.trim() || null,
      updatedAt: new Date().toISOString(),
    },
  };
  await writeJson(filePath, next);
  return next;
}

export function feedbackCursorPath(root: string, projectId: string): string {
  return path.join(path.resolve(root), "content-v2", ".feedback-sync", `${validId(projectId, "project ID")}.json`);
}

export async function readFeedbackCursor(root: string, projectId: string): Promise<FeedbackCursor | null> {
  try {
    return JSON.parse(await fs.readFile(feedbackCursorPath(root, projectId), "utf8")) as FeedbackCursor;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function writeFeedbackCursor(root: string, projectId: string, cursor: FeedbackCursor): Promise<void> {
  await writeJson(feedbackCursorPath(root, projectId), { ...cursor, schemaVersion: feedbackCursorSchemaVersion });
}
