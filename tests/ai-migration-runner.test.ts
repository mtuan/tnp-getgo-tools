import assert from "node:assert/strict"
import test from "node:test"
import type { AiMigrationJob, QuizQuestionRecord } from "../src/shared/domain/models.js"
import { createJobTask } from "../src/features/jobs/main/job-task-tracker.js"
import {
  runTopicAiMigration,
  type AiMigrationRuntime,
  type AiQuizTarget,
} from "../src/features/ai/main/ai-migration-runner.js"

test("topic AI migration runs quizzes in order with one task per quiz", async () => {
  const targets: AiQuizTarget[] = [
    { manifestPath: "/a/quiz.json", contestId: "seamo", quizId: "a", quizTitle: "Paper A", context: {} },
    { manifestPath: "/b/quiz.json", contestId: "seamo", quizId: "b", quizTitle: "Paper B", context: {} },
  ]
  const job: AiMigrationJob = {
    id: "topic-job", scope: "topic", contestId: "seamo", quizId: "", quizTitle: "SEAMO",
    manifestPath: "/topic.json", context: { jobTasks: [
      createJobTask("quiz-a", "Paper A"),
      createJobTask("quiz-b", "Paper B"),
    ] },
    status: "running", total: 2, processed: 0, succeeded: 0, failed: 0,
    skippedImages: 0, skippedVerified: 0, errors: [], createdAt: "2026-01-01T00:00:00.000Z",
  }
  const calls: string[] = []
  const question = { question_no: 1, text_en: "1 + 1", answer: { type: "input", correct: 2 } } as QuizQuestionRecord
  await runTopicAiMigration(job, targets, {
    service: {} as AiMigrationRuntime["service"], cancelled: false, paused: false,
  }, {
    loadRecords: async target => target.quizId === "a" ? [question] : [],
    processQuestion: async target => { calls.push(target.quizId); return { status: "completed" } },
    persist: async () => undefined,
  })
  assert.deepEqual(calls, ["a"])
  assert.deepEqual((job.context.jobTasks as Array<{ status: string; completed?: number; total?: number }>).map(task => ({
    status: task.status,
    completed: task.completed,
    total: task.total,
  })), [
    { status: "completed", completed: 1, total: 1 },
    { status: "skipped", completed: 0, total: 0 },
  ])
});

test("topic AI migration persists question progress while a quiz is running", async () => {
  const target: AiQuizTarget = {
    manifestPath: "/a/quiz.json", contestId: "seamo", quizId: "a", quizTitle: "Paper A", context: {},
  }
  const task = createJobTask("quiz-a", "Paper A")
  const job: AiMigrationJob = {
    id: "topic-progress", scope: "topic", contestId: "seamo", quizId: "", quizTitle: "SEAMO",
    manifestPath: "/topic.json", context: { jobTasks: [task] }, status: "running",
    total: 1, processed: 0, succeeded: 0, failed: 0, skippedImages: 0, skippedVerified: 0,
    errors: [], createdAt: "2026-01-01T00:00:00.000Z",
  }
  const questions = [1, 2, 3].map(question_no => ({
    question_no, text_en: `${question_no} + 1`, answer: { type: "input", correct: question_no + 1 },
  } as QuizQuestionRecord))
  const snapshots: Array<{ completed?: number; total?: number }> = []
  await runTopicAiMigration(job, [target], {
    service: {} as AiMigrationRuntime["service"], cancelled: false, paused: false,
  }, {
    loadRecords: async () => questions,
    processQuestion: async () => ({ status: "completed" }),
    persist: async () => { snapshots.push({ completed: task.completed, total: task.total }) },
  })
  assert.ok(snapshots.some(snapshot => snapshot.completed === 1 && snapshot.total === 3))
  assert.ok(snapshots.some(snapshot => snapshot.completed === 2 && snapshot.total === 3))
  assert.deepEqual({ completed: task.completed, total: task.total }, { completed: 3, total: 3 })
})
