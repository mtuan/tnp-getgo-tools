import { promises as fs } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import type { AiMigrationJob, AiMigrationJobsSnapshot, ContestQuizQuestionRecord, QuizAiMigrationJob, QuizQuestionRecord } from "../../../shared/domain/models.js"
import { questionIsVerified, withQuestionStatus } from "../../../features/quiz-editor/domain/question-status.js"
import { questionContainsImages } from "../../../features/quiz-editor/domain/question-images.js"
import { loadQuizQuestions, saveQuizQuestion } from "../../quiz-editor/repository/quiz-questions.js"
import { LocalAiService, type LocalAiConfiguration } from "./local-ai.js"
import { isBulkCodexQuestionCandidate, codexQuestionGeneratorMarker } from "../domain/bulk-question-generation.js"
import type { ContentV2Question } from "../../topics/domain/content-v2.js"
import { loadContentV2Question, loadContentV2Quiz, loadContentV2Topic, saveContentV2Question } from "../../topics/repository/content-v2-repository.js"
import { currentQuizBuilderApiVersion } from "../../../shared/domain/models.js"
import { compileDynamicQuestion } from "./dynamic-question-compiler.js"
import { createJobTask, finishJobTask, finishPendingJobTasks, resetInterruptedJobTasks, startJobTask } from "../../jobs/main/job-task-tracker.js"
import { ensureAiQuestionTasks, storedAiQuestionTasks } from "./ai-question-job-report.js"

interface StoredState { concurrency: number; jobs: AiMigrationJob[] }
interface RuntimeJob { service: LocalAiService; cancelled: boolean; paused: boolean; resume?: () => void }

export class AiMigrationJobManager {
  private concurrency = 1
  private jobs: AiMigrationJob[] = []
  private runtimes = new Map<string, RuntimeJob>()
  private loadPromise: Promise<void> | null = null
  private persistChain: Promise<void> = Promise.resolve()
  constructor(
    private readonly userDataPath: string,
    private readonly aiConfiguration: LocalAiConfiguration,
    private readonly validateGeneratedContent?: (label: string, value: unknown) => Promise<void>,
    private readonly repositoryRoot?: () => Promise<string>,
  ) {}
  setProfile(profile: "thorough" | "fast") { this.aiConfiguration.profile = profile }
  private get filePath() { return path.join(this.userDataPath, "ai-migration-jobs.json") }

  private ensureLoaded() {
    this.loadPromise ??= this.load()
    return this.loadPromise
  }

  private async load() {
    try {
      const stored = JSON.parse(await fs.readFile(this.filePath, "utf8")) as StoredState
      this.concurrency = Math.max(1, Math.min(4, Number(stored.concurrency) || 1))
      this.jobs = Array.isArray(stored.jobs) ? stored.jobs.slice(0, 50).map(job => {
        ensureAiQuestionTasks(job)
        if (!["queued", "running"].includes(job.status)) return job
        resetInterruptedJobTasks(storedAiQuestionTasks(job))
        return { ...job, status: "queued" as const, currentQuestion: undefined, finishedAt: undefined }
      }) : []
    } catch { this.jobs = [] }
    await this.persist()
    // Backfill old global history into each quiz so migration state travels with
    // the repository even when it is opened on another machine.
    await Promise.allSettled(this.jobs.map(job => this.persistQuizJob(job)))
    this.schedule()
  }

  private async persist() {
    const contents = JSON.stringify({ concurrency: this.concurrency, jobs: this.jobs.slice(0, 50) }, null, 2)
    this.persistChain = this.persistChain.then(async () => {
      await fs.mkdir(this.userDataPath, { recursive: true })
      await fs.writeFile(this.filePath, contents, "utf8")
    })
    await this.persistChain
  }

  private async persistQuizJob(job: AiMigrationJob) {
    const { manifestPath, context: _context, ...stored } = job
    const filePath = path.join(path.dirname(manifestPath), "ai-migration-job.json")
    await fs.writeFile(filePath, JSON.stringify(stored satisfies QuizAiMigrationJob, null, 2), "utf8")
  }

  private async persistJob(job: AiMigrationJob) {
    const tasks = storedAiQuestionTasks(job)
    if (tasks.length) {
      job.total = tasks.length
      job.processed = tasks.filter(task => ["completed", "failed", "cancelled", "skipped"].includes(task.status)).length
      job.succeeded = tasks.filter(task => task.status === "completed").length
      job.failed = tasks.filter(task => task.status === "failed").length
    }
    await this.persist()
    await this.persistQuizJob(job)
  }

  private snapshot(): AiMigrationJobsSnapshot { return { concurrency: this.concurrency, jobs: structuredClone(this.jobs) } }
  async list() { await this.ensureLoaded(); return this.snapshot() }

  async setConcurrency(value: number) {
    await this.ensureLoaded()
    this.concurrency = Math.max(1, Math.min(4, Math.trunc(value)))
    await this.persist(); this.schedule(); return this.snapshot()
  }

  private isContentV2(job: Pick<AiMigrationJob, "manifestPath">) {
    return job.manifestPath.split(path.sep).includes("content-v2") && path.basename(job.manifestPath) === "quiz.json"
  }

  private async contentV2Questions(job: Pick<AiMigrationJob, "contestId" | "quizId">) {
    if (!this.repositoryRoot) throw new Error("The content repository is not available.")
    const root = await this.repositoryRoot()
    const quizDirectory = path.join(root, "content-v2", "topics", job.contestId, "quizzes", job.quizId)
    const names = await fs.readdir(path.join(quizDirectory, "questions"))
    const questions = await Promise.all(names.filter(name => name.endsWith(".json")).map(name =>
      loadContentV2Question(root, job.contestId, job.quizId, name.slice(0, -5))))
    return questions.sort((left, right) => left.order - right.order)
  }

  private contentV2Record(question: ContentV2Question): QuizQuestionRecord | null {
    if (question.type !== "competition-question") return null
    const match = question.id.match(/^q(\d+)$/i)
    return {
      question_no: Number(match?.[1] ?? question.order + 1),
      category: question.category,
      text_en: question.text.en,
      text_vn: question.text.vi,
      image_datas: question.assets,
      answer: question.answer,
      explanation: question.explanation,
      source: question.source,
      solutions: question.solutions,
      feedback: question.feedback,
      ...(question.authoringMode === "reference" && question.reference
        ? { authoringMode: "reference", reference: question.reference }
        : question.dynamic
          ? { authoringMode: "advanced-dynamic", advancedDynamic: question.dynamic }
          : {}),
      ...(question.status === "reviewed" ? { status: "verified" } : question.status === "rejected" ? { status: "rejected" } : {}),
    }
  }

  private async loadRecords(job: AiMigrationJob) {
    if (!this.isContentV2(job)) return loadQuizQuestions(job.manifestPath)
    return (await this.contentV2Questions(job))
      .map(question => this.contentV2Record(question))
      .filter((question): question is QuizQuestionRecord => Boolean(question))
  }

  private async saveContentV2Result(job: AiMigrationJob, current: QuizQuestionRecord, result: Awaited<ReturnType<LocalAiService["createDynamicQuestionProposal"]>>) {
    if (!this.repositoryRoot) throw new Error("The content repository is not available.")
    const root = await this.repositoryRoot()
    const stored = (await this.contentV2Questions(job)).find(question =>
      String(this.contentV2Record(question)?.question_no) === String(current.question_no))
    if (!stored || stored.type !== "competition-question") throw new Error(`Question ${current.question_no} was not found.`)
    const dynamicRecord = {
      ...current,
      authoringMode: "advanced-dynamic",
      advancedDynamic: { ...current.advancedDynamic, ...result.proposal },
    } as QuizQuestionRecord
    const compiledJs = await compileDynamicQuestion(dynamicRecord as ContestQuizQuestionRecord)
    const [topic, quiz] = await Promise.all([
      loadContentV2Topic(root, job.contestId),
      loadContentV2Quiz(root, job.contestId, job.quizId),
    ])
    await saveContentV2Question(root, topic, quiz, {
      ...stored,
      status: "pending",
      authoringMode: "advanced-dynamic",
      reference: undefined,
      dynamic: {
        ...result.proposal,
        paramsGeneratorTs: result.proposal.paramsGeneratorTs.includes(codexQuestionGeneratorMarker)
          ? result.proposal.paramsGeneratorTs
          : `${codexQuestionGeneratorMarker}\n${result.proposal.paramsGeneratorTs}`,
        ...(compiledJs ? { compiledJs, quizBuilderApiVersion: currentQuizBuilderApiVersion } : {}),
      },
    })
  }

  async start(input: { manifestPath: string; context: Record<string, unknown> }) {
    await this.ensureLoaded()
    const quizId = String(input.context.quizId ?? "")
    const contestId = String(input.context.contestId ?? "")
    if (!quizId || !contestId || !path.isAbsolute(input.manifestPath)) throw new Error("Invalid quiz migration job.")
    const duplicate = this.jobs.find(job => job.quizId === quizId && job.contestId === contestId && ["queued", "running", "paused"].includes(job.status))
    if (duplicate) return duplicate
    const jobIdentity = { manifestPath: input.manifestPath, contestId, quizId } as AiMigrationJob
    const records = await this.loadRecords(jobIdentity)
    const candidates = records.filter(isBulkCodexQuestionCandidate)
    const job: AiMigrationJob = {
      id: randomUUID(), contestId, quizId, quizTitle: String(input.context.title ?? quizId), manifestPath: input.manifestPath,
      context: {
        ...input.context,
        questionNumbers: candidates.map(record => String(record.question_no)),
        jobTasks: candidates.map(record => createJobTask(`question-${record.question_no}`, `Question ${record.question_no}`)),
      },
      status: "queued", total: candidates.length,
      processed: 0, succeeded: 0, failed: 0,
      skippedImages: records.filter(record => !questionIsVerified(record) && !record.advancedDynamic && questionContainsImages(record)).length,
      skippedVerified: records.filter(questionIsVerified).length,
      errors: [], createdAt: new Date().toISOString(),
    }
    this.jobs.unshift(job); await this.persistJob(job); this.schedule(); return structuredClone(job)
  }

  async cancel(id: string) {
    await this.ensureLoaded()
    const job = this.jobs.find(item => item.id === id)
    if (!job || !["queued", "running", "paused"].includes(job.status)) return this.snapshot()
    const runtime = this.runtimes.get(id)
    if (runtime) { runtime.cancelled = true; runtime.paused = false; runtime.resume?.(); runtime.service.cancelDynamicQuestionAi() }
    job.status = "cancelled"; job.currentQuestion = undefined; job.finishedAt = new Date().toISOString()
    const activeTask = storedAiQuestionTasks(job).find(task => task.status === "running")
    if (!runtime && activeTask) finishJobTask(activeTask, "cancelled", activeTask.details, job.finishedAt)
    if (!runtime) finishPendingJobTasks(storedAiQuestionTasks(job), "skipped", job.finishedAt)
    await this.persistJob(job); this.schedule(); return this.snapshot()
  }

  async pause(id: string) {
    await this.ensureLoaded()
    const job = this.jobs.find(item => item.id === id)
    if (!job || !["queued", "running"].includes(job.status)) return this.snapshot()
    const runtime = this.runtimes.get(id)
    if (runtime) runtime.paused = true
    job.status = "paused"
    await this.persistJob(job)
    return this.snapshot()
  }

  async resume(id: string) {
    await this.ensureLoaded()
    const job = this.jobs.find(item => item.id === id)
    if (!job || job.status !== "paused") return this.snapshot()
    const runtime = this.runtimes.get(id)
    if (runtime) { runtime.paused = false; job.status = "running"; runtime.resume?.() }
    else job.status = "queued"
    await this.persistJob(job); this.schedule(); return this.snapshot()
  }

  async retry(id: string) {
    await this.ensureLoaded()
    const job = this.jobs.find(item => item.id === id)
    if (!job || !["failed", "cancelled"].includes(job.status)) return this.snapshot()
    await this.start({ manifestPath: job.manifestPath, context: job.context ?? { contestId: job.contestId, quizId: job.quizId, title: job.quizTitle } })
    return this.snapshot()
  }

  async delete(id: string) {
    await this.ensureLoaded()
    const job = this.jobs.find(item => item.id === id)
    if (!job || ["queued", "running", "paused"].includes(job.status)) return this.snapshot()
    this.jobs = this.jobs.filter(item => item.id !== id)
    await fs.unlink(path.join(path.dirname(job.manifestPath), "ai-migration-job.json")).catch(() => undefined)
    await this.persist()
    return this.snapshot()
  }

  async clearFinished() {
    await this.ensureLoaded()
    const finished = this.jobs.filter(job => !["queued", "running", "paused"].includes(job.status))
    this.jobs = this.jobs.filter(job => ["queued", "running", "paused"].includes(job.status))
    await Promise.all(finished.map(job =>
      fs.unlink(path.join(path.dirname(job.manifestPath), "ai-migration-job.json")).catch(() => undefined),
    ))
    await this.persist()
    return this.snapshot()
  }

  private schedule() {
    const capacity = this.concurrency - this.runtimes.size
    if (capacity <= 0) return
    for (const job of this.jobs.filter(item => item.status === "queued").slice(0, capacity)) void this.run(job, job.context ?? { contestId: job.contestId, quizId: job.quizId, title: job.quizTitle })
  }

  private async run(job: AiMigrationJob, context: Record<string, unknown>) {
    const service = new LocalAiService(this.aiConfiguration)
    const runtime: RuntimeJob = { service, cancelled: false, paused: false }
    this.runtimes.set(job.id, runtime); job.status = "running"; job.startedAt = new Date().toISOString(); await this.persistJob(job)
    try {
      const initial = await this.loadRecords(job)
      const tasks = ensureAiQuestionTasks(job)
      await this.persistJob(job)
      const queue = initial.filter(record => isBulkCodexQuestionCandidate(record)
        && tasks.find(task => task.id === `question-${record.question_no}`)?.status === "pending")
      for (const queued of queue) {
        if (runtime.paused) await new Promise<void>(resolve => { runtime.resume = resolve })
        runtime.resume = undefined
        if (runtime.cancelled) break
        const latest = (await this.loadRecords(job)).find(record => String(record.question_no) === String(queued.question_no))
        const task = storedAiQuestionTasks(job).find(item => item.id === `question-${queued.question_no}`)
        if (!latest || !isBulkCodexQuestionCandidate(latest)) { if (task) finishJobTask(task, "skipped"); if (latest && questionIsVerified(latest)) job.skippedVerified += 1; else if (latest && !latest.advancedDynamic && questionContainsImages(latest)) job.skippedImages += 1; await this.persistJob(job); continue }
        job.currentQuestion = String(latest.question_no); if (task) startJobTask(task); await this.persistJob(job)
        const startedAt = Date.now()
        try {
          const result = await service.createDynamicQuestionProposal({ question: latest, context, provider: "codex-cli" })
          await this.validateGeneratedContent?.(`AI migration question ${latest.question_no}`, result)
          if (runtime.cancelled) break
          const current = (await this.loadRecords(job)).find(record => String(record.question_no) === String(latest.question_no))
          if (!current || questionIsVerified(current)) { if (task) finishJobTask(task, "skipped"); job.skippedVerified += current && questionIsVerified(current) ? 1 : 0; await this.persistJob(job); continue }
          const proposal = result.proposal
          if (this.isContentV2(job)) await this.saveContentV2Result(job, current, result)
          else await saveQuizQuestion(job.manifestPath, withQuestionStatus({ ...current, authoringMode: "advanced-dynamic", advancedDynamic: { ...current.advancedDynamic, paramsGeneratorTs: proposal.paramsGeneratorTs, questionGeneratorTs: proposal.questionGeneratorTs, originParamsTs: proposal.originParamsTs, explanationGeneratorTs: proposal.explanationGeneratorTs }, aiResponse: { ...result, generatedAt: new Date().toISOString(), processingTimeMs: Date.now() - startedAt } } as QuizQuestionRecord, "pending"))
          if (task) finishJobTask(task, "completed")
        } catch (cause) {
          if (runtime.cancelled) break
          const message = cause instanceof Error ? cause.message : String(cause)
          if (task) finishJobTask(task, "failed", [message])
          job.errors.push({ questionNo: String(latest.question_no), message })
        }
        await this.persistJob(job)
      }
      if (!runtime.cancelled) job.status = job.failed > 0 ? "failed" : "completed"
    } catch (cause) {
      if (!runtime.cancelled) {
        const message = cause instanceof Error ? cause.message : String(cause)
        const activeTask = storedAiQuestionTasks(job).find(task => task.status === "running")
        if (activeTask) finishJobTask(activeTask, "failed", [message])
        job.status = "failed"; job.errors.push({ questionNo: job.currentQuestion ?? "—", message })
      }
    } finally {
      const activeTask = storedAiQuestionTasks(job).find(task => task.status === "running")
      if (runtime.cancelled && activeTask) finishJobTask(activeTask, "cancelled")
      if (["completed", "failed", "cancelled"].includes(job.status)) finishPendingJobTasks(storedAiQuestionTasks(job), "skipped")
      job.currentQuestion = undefined; job.finishedAt ??= new Date().toISOString(); this.runtimes.delete(job.id); await this.persistJob(job); this.schedule()
    }
  }
}
