import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BackgroundJob } from "../src/shared/domain/models.js";
import { normalizeBackgroundJobReport } from "../src/features/jobs/main/background-job-report.js";
import { createAiQuestionJobReport, ensureAiQuestionTasks } from "../src/features/ai/main/ai-question-job-report.js";
import { createJobTask, finishJobTask, normalizeJobTaskReport, resetInterruptedJobTasks, startJobTask } from "../src/features/jobs/main/job-task-tracker.js";

const ipcSource = readFileSync(new URL("../src/features/jobs/main/background-jobs-ipc.ts", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("../src/features/deployment/components/DeploymentJobReportDrawer.tsx", import.meta.url), "utf8");

test("every background job receives a structured task report", () => {
  assert.match(ipcSource, /\.map\(normalizeBackgroundJobReport\)[\s\S]*?\.map\(withFallbackLogs\)/);
  const job: BackgroundJob = {
    id: "release-1", kind: "deploy", component: "release", operation: "deploy", target: "staging",
    releaseId: "getgo-test", name: "Activate release", description: "Deploy release", status: "failed",
    completed: 0, total: 8, createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z", cancellable: false, retryable: true, error: "Readiness failed",
  };
  const normalized = normalizeBackgroundJobReport(job);
  assert.equal(normalized.report?.steps.length, 8);
  assert.equal(normalized.total, 8);
  assert.equal(normalized.report?.steps[0].status, "failed");
  assert.equal(normalized.report?.steps.slice(1).every(step => step.status === "skipped"), true);
});

test("item-based jobs keep one measured operation instead of fake task rows", () => {
  const job: BackgroundJob = {
    id: "publish-1", kind: "publish", name: "Publish topics", description: "Publish", status: "running",
    completed: 4, total: 10, createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:01.000Z",
    cancellable: true,
  };
  const normalized = normalizeBackgroundJobReport(job);
  assert.equal(normalized.report?.steps.length, 1);
  assert.equal(normalized.report?.steps[0].completed, 4);
  assert.equal(normalized.report?.steps[0].total, 10);
});

test("AI generation reports one real task for every selected question", () => {
  const report = createAiQuestionJobReport({
    id: "ai-1", contestId: "seamo", quizId: "paper-a", quizTitle: "Paper A",
    manifestPath: "/quiz.json", context: { questionNumbers: [1, 2, 5] }, status: "running",
    total: 3, processed: 1, succeeded: 1, failed: 0, skippedImages: 0, skippedVerified: 0,
    currentQuestion: "2", errors: [], createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
  });
  assert.deepEqual(report.steps.map(step => [step.label, step.status]), [
    ["Question 1", "completed"],
    ["Question 2", "running"],
    ["Question 5", "pending"],
  ]);
});

test("AI generation never presents a partial terminal job as fully completed", () => {
  const report = createAiQuestionJobReport({
    id: "ai-2", contestId: "seamo", quizId: "paper-a", quizTitle: "Paper A",
    manifestPath: "/quiz.json", context: {}, status: "completed", total: 4, processed: 1,
    succeeded: 1, failed: 0, skippedImages: 0, skippedVerified: 0, errors: [],
    createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:00:02.000Z",
  });
  assert.deepEqual(report.steps.map(step => step.status), ["completed", "skipped", "skipped", "skipped"]);
});

test("legacy AI jobs are migrated to persisted task records", () => {
  const job = {
    id: "ai-legacy", contestId: "seamo", quizId: "paper-a", quizTitle: "Paper A",
    manifestPath: "/quiz.json", context: { questionNumbers: [2, 3] }, status: "running" as const,
    total: 2, processed: 1, succeeded: 1, failed: 0, skippedImages: 0, skippedVerified: 0,
    currentQuestion: "3", errors: [], createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
  };
  const tasks = ensureAiQuestionTasks(job);
  assert.equal(job.context.jobTasks, tasks);
  assert.deepEqual(tasks.map(task => task.status), ["completed", "running"]);
});

test("every task kind uses the same measured lifecycle", () => {
  const task = createJobTask("question-2", "Question 2");
  startJobTask(task, "2026-01-01T00:00:01.000Z");
  finishJobTask(task, "completed", [], "2026-01-01T00:00:04.250Z");
  assert.equal(task.status, "completed");
  assert.equal(task.durationMs, 3_250);

  const job: BackgroundJob = {
    id: "ai-1", kind: "ai-migrate", name: "Generate questions", description: "Generate", status: "completed",
    completed: 1, total: 1, createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:04.250Z", cancellable: false,
  };
  const report = normalizeJobTaskReport({ operation: "run", component: "ai-migrate", startedAt: job.startedAt!, items: [], steps: [task] }, job);
  assert.equal(report.durationMs, 3_250);
  assert.equal(report.steps[0].durationMs, 3_250);
});

test("interrupted running tasks return to pending before a job resumes", () => {
  const task = createJobTask("question-2", "Question 2");
  startJobTask(task, "2026-01-01T00:00:01.000Z");
  resetInterruptedJobTasks([task]);
  assert.deepEqual(task, { id: "question-2", label: "Question 2", status: "pending", details: [] });
});

test("the report task table renders measured job progress", () => {
  assert.match(drawerSource, /typeof step\.completed === "number"/);
  assert.match(drawerSource, /Math\.round\(\(step\.completed! \/ step\.total!\) \* 100\)/);
  assert.match(drawerSource, /step\.status === "running" && !hasMeasuredProgress/);
});

test("every job report uses the same canonical inline section layout", () => {
  assert.match(drawerSource, /className="deployment-report-panels deployment-report-sections-inline"/);
  assert.equal((drawerSource.match(/variant="inline"/g) ?? []).length, 4);
  assert.doesNotMatch(drawerSource, /isWebReleaseReport|sectionVariant|variant="panel"/);
});
