import { promises as fs } from "node:fs"
import path from "node:path"
import type { AiMigrationJob, QuizQuestionRecord } from "../../../shared/domain/models.js"
import { isBulkCodexQuestionCandidate } from "../domain/bulk-question-generation.js"
import { ensureAiQuestionTasks, storedAiQuestionTasks } from "./ai-question-job-report.js"
import { finishJobTask, startJobTask } from "../../jobs/main/job-task-tracker.js"
import type { LocalAiService } from "./local-ai.js"
import { loadContentV2Quiz, loadContentV2Topic } from "../../topics/repository/content-v2-repository.js"

export interface AiQuizTarget {
  manifestPath: string
  contestId: string
  quizId: string
  quizTitle: string
  context: Record<string, unknown>
}

export function quizAiTarget(job: AiMigrationJob): AiQuizTarget {
  return {
    manifestPath: job.manifestPath,
    contestId: job.contestId,
    quizId: job.quizId,
    quizTitle: job.quizTitle,
    context: job.context,
  }
}

export function storedTopicAiTargets(job: AiMigrationJob): AiQuizTarget[] {
  const values = job.context.quizzes
  if (!Array.isArray(values)) return []
  return values.filter((value): value is AiQuizTarget => Boolean(
    value && typeof value === "object"
    && typeof value.manifestPath === "string"
    && typeof value.contestId === "string"
    && typeof value.quizId === "string"
    && typeof value.quizTitle === "string"
    && value.context && typeof value.context === "object" && !Array.isArray(value.context),
  ))
}

export interface AiMigrationRuntime {
  service: LocalAiService
  cancelled: boolean
  paused: boolean
  resume?: () => void
}

export type AiQuestionProcessResult = {
  status: "completed" | "skipped" | "cancelled" | "failed"
  message?: string
}

export async function discoverTopicAiTargets(
  root: string,
  input: { topicId: string; title: string },
): Promise<{ title: string; manifestPath: string; targets: AiQuizTarget[] }> {
  const topic = await loadContentV2Topic(root, input.topicId)
  const topicDirectory = path.join(root, "content-v2", "topics", input.topicId)
  const quizzesDirectory = path.join(topicDirectory, "quizzes")
  const entries = await fs.readdir(quizzesDirectory, { withFileTypes: true })
  const quizzes = (await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry =>
    loadContentV2Quiz(root, input.topicId, entry.name))))
    .filter(quiz => quiz.type === "competition-paper")
    .sort((left, right) => left.order - right.order)
  return {
    title: input.title || String(topic.title),
    manifestPath: path.join(topicDirectory, "topic.json"),
    targets: quizzes.map(quiz => ({
      manifestPath: path.join(quizzesDirectory, quiz.id, "quiz.json"),
      contestId: input.topicId,
      quizId: quiz.id,
      quizTitle: quiz.title,
      context: {
        contestId: input.topicId,
        quizId: quiz.id,
        title: quiz.title,
        year: quiz.year,
        grade: quiz.grade,
        round: quiz.round,
        supportedLanguages: quiz.supportedLanguages,
      },
    })),
  }
}

interface RunnerDependencies {
  loadRecords(target: AiQuizTarget): Promise<QuizQuestionRecord[]>
  processQuestion(target: AiQuizTarget, questionNo: string): Promise<AiQuestionProcessResult>
  persist(): Promise<void>
}

async function waitWhilePaused(runtime: AiMigrationRuntime) {
  if (runtime.paused) await new Promise<void>(resolve => { runtime.resume = resolve })
  runtime.resume = undefined
}

export async function runQuizAiMigration(
  job: AiMigrationJob,
  target: AiQuizTarget,
  runtime: AiMigrationRuntime,
  dependencies: RunnerDependencies,
) {
  const initial = await dependencies.loadRecords(target)
  const tasks = ensureAiQuestionTasks(job)
  await dependencies.persist()
  const queue = initial.filter(record => isBulkCodexQuestionCandidate(record)
    && tasks.find(task => task.id === `question-${record.question_no}`)?.status === "pending")
  for (const queued of queue) {
    await waitWhilePaused(runtime)
    if (runtime.cancelled) break
    const questionNo = String(queued.question_no)
    const task = storedAiQuestionTasks(job).find(item => item.id === `question-${questionNo}`)
    job.currentQuestion = questionNo
    if (task) startJobTask(task)
    await dependencies.persist()
    const result = await dependencies.processQuestion(target, questionNo)
    if (task) finishJobTask(task, result.status, result.message ? [result.message] : [])
    if (result.message) job.errors.push({ questionNo, message: result.message })
    await dependencies.persist()
    if (result.status === "cancelled") break
  }
}

export async function runTopicAiMigration(
  job: AiMigrationJob,
  targets: AiQuizTarget[],
  runtime: AiMigrationRuntime,
  dependencies: RunnerDependencies,
) {
  const tasks = ensureAiQuestionTasks(job)
  for (const target of targets) {
    await waitWhilePaused(runtime)
    if (runtime.cancelled) break
    const task = tasks.find(item => item.id === `quiz-${target.quizId}`)
    if (!task || task.status !== "pending") continue
    startJobTask(task)
    await dependencies.persist()
    const candidates = (await dependencies.loadRecords(target)).filter(isBulkCodexQuestionCandidate)
    task.completed = 0
    task.total = candidates.length
    if (!candidates.length) {
      finishJobTask(task, "skipped", ["No questions need generation."])
      await dependencies.persist()
      continue
    }
    let generated = 0
    let skipped = 0
    const failures: string[] = []
    for (const candidate of candidates) {
      await waitWhilePaused(runtime)
      if (runtime.cancelled) break
      const questionNo = String(candidate.question_no)
      job.currentQuestion = `${target.quizTitle} · Question ${questionNo}`
      const result = await dependencies.processQuestion(target, questionNo)
      if (result.status === "completed") generated += 1
      else if (result.status === "skipped") skipped += 1
      else if (result.status === "failed") {
        const message = `Question ${questionNo}: ${result.message ?? "AI generation failed."}`
        failures.push(message)
        job.errors.push({ questionNo: `${target.quizTitle} · ${questionNo}`, message: result.message ?? message })
      }
      if (result.status !== "cancelled") task.completed += 1
      await dependencies.persist()
      if (result.status === "cancelled") break
    }
    if (runtime.cancelled) break
    finishJobTask(task, failures.length ? "failed" : "completed", [
      `${generated} generated · ${skipped} skipped`,
      ...failures,
    ])
    await dependencies.persist()
  }
}
