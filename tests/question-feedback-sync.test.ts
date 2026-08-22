import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { QuestionFeedbackSyncService } from "../src/features/topics/main/question-feedback-sync.js";
import { listAllQuestionFeedback, listQuestionFeedbackOverview, loadQuestionFeedback, updateQuestionFeedbackReview } from "../src/features/topics/repository/question-feedback-repository.js";

const value = (input: unknown): Record<string, unknown> => {
  if (input === null) return { nullValue: null };
  if (typeof input === "string") return input.includes("T") && input.endsWith("Z") ? { timestampValue: input } : { stringValue: input };
  if (Array.isArray(input)) return { arrayValue: { values: input.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([key, item]) => [key, value(item)])) } };
};

test("question feedback sync fetches only after its cursor and keeps review state local", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-feedback-"));
  const quizDirectory = path.join(root, "content-v2/topics/topic/quizzes/quiz");
  await fs.mkdir(quizDirectory, { recursive: true });
  await fs.writeFile(path.join(quizDirectory, "quiz.json"), "{}\n");
  await fs.writeFile(path.join(root, "content-v2/topics/topic/topic.json"), JSON.stringify({ title: "Topic title" }));
  await fs.writeFile(path.join(quizDirectory, "quiz.json"), JSON.stringify({ title: "Quiz title" }));
  await fs.mkdir(path.join(quizDirectory, "questions"));
  await fs.writeFile(path.join(quizDirectory, "questions/q1.json"), JSON.stringify({ text: { en: "Question text" } }));
  const documentName = "projects/project/databases/(default)/documents/question-reports/report-1";
  const reportedAt = "2026-08-21T01:02:03.000Z";
  const bodies: Array<Record<string, unknown>> = [];
  let call = 0;
  const auth = {
    publishingTarget: async () => ({ environment: "development", projectId: "project" }),
    firestoreRequest: async (_path: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      const payload = call++ === 0 ? [{ document: { name: documentName, fields: {
        topicId: value("topic"), quizId: value("quiz"), questionId: value("q1"),
        issueTypes: value(["wrong_answer"]), comment: value("Incorrect key"),
        params: value({ seed: "one" }), reportedAt: value(reportedAt), reportedBy: value("user"),
      } } }] : [];
      return { projectId: "project", response: new Response(JSON.stringify(payload), { status: 200 }) };
    },
  };
  const service = new QuestionFeedbackSyncService(auth as never);
  const first = await service.sync(root);
  assert.equal(first.saved, 1);
  const records = await loadQuestionFeedback(root, "topic", "quiz", "q1");
  assert.equal(records[0]?.source.comment, "Incorrect key");
  assert.equal((await listAllQuestionFeedback(root)).length, 1);
  const overview = await listQuestionFeedbackOverview(root);
  assert.equal(overview[0]?.topicTitle, "Topic title");
  assert.equal(overview[0]?.quizTitle, "Quiz title");
  assert.equal(overview[0]?.questionText, "Question text");
  const reviewed = await updateQuestionFeedbackReview(root, "topic", "quiz", "report-1", "fixed");
  assert.equal(reviewed.review.status, "fixed");
  const second = await service.sync(root);
  assert.equal(second.saved, 0);
  const structuredQuery = bodies[1]?.structuredQuery as { startAt?: { before?: boolean; values?: unknown[] } };
  assert.equal(structuredQuery.startAt?.before, false);
  assert.equal(structuredQuery.startAt?.values?.length, 2);
  assert.equal((await loadQuestionFeedback(root, "topic", "quiz", "q1"))[0]?.review.status, "fixed");
});

test("question feedback sync backfills legacy reports without topicId once", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-feedback-legacy-"));
  const quizDirectory = path.join(root, "content-v2/topics/legacy-topic/quizzes/legacy-quiz");
  await fs.mkdir(quizDirectory, { recursive: true });
  await fs.writeFile(path.join(quizDirectory, "quiz.json"), "{}\n");
  const cursorDirectory = path.join(root, "content-v2/.feedback-sync");
  await fs.mkdir(cursorDirectory, { recursive: true });
  await fs.writeFile(path.join(cursorDirectory, "project.json"), JSON.stringify({
    reportedAt: "2026-08-21T02:00:00.000Z",
    documentName: "projects/project/databases/(default)/documents/question-reports/newer",
  }));
  const bodies: Array<Record<string, unknown>> = [];
  let call = 0;
  const auth = {
    publishingTarget: async () => ({ environment: "development", projectId: "project" }),
    firestoreRequest: async (_path: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      const payload = call++ === 0 ? [{ document: {
        name: "projects/project/databases/(default)/documents/question-reports/legacy",
        fields: {
          quizId: value("legacy-quiz"), questionId: value("q2"),
          issueType: value(["wrong_answer", "missing_content"]),
          reportedAt: value("2026-08-20T01:00:00.000Z"), reportedBy: value("user"),
        },
      } }] : [];
      return { projectId: "project", response: new Response(JSON.stringify(payload), { status: 200 }) };
    },
  };
  const service = new QuestionFeedbackSyncService(auth as never);
  assert.equal((await service.sync(root)).saved, 1);
  const records = await loadQuestionFeedback(root, "legacy-topic", "legacy-quiz", "q2");
  assert.deepEqual(records[0]?.source.issueTypes, ["wrong_answer", "missing_content"]);
  assert.equal((bodies[0]?.structuredQuery as { startAt?: unknown }).startAt, undefined);
  await service.sync(root);
  assert.ok((bodies[1]?.structuredQuery as { startAt?: unknown }).startAt);
});
