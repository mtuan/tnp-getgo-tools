import { promises as fs } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import type { AiMigrationJob, AiMigrationJobsSnapshot, QuizAiMigrationJob, QuizQuestionRecord } from "../core/models.js"
import { questionIsVerified, withQuestionStatus } from "../core/question-status.js"
import { questionContainsImages } from "../core/question-images.js"
import { loadQuizQuestions, saveQuizQuestion } from "../repositories/quiz-questions.js"
import { LocalAiService, type LocalAiConfiguration } from "./local-ai.js"

interface StoredState { concurrency: number; jobs: AiMigrationJob[] }
interface RuntimeJob { service: LocalAiService; cancelled: boolean }

export class AiMigrationJobManager {
  private concurrency = 1
  private jobs: AiMigrationJob[] = []
  private runtimes = new Map<string, RuntimeJob>()
  private loadPromise: Promise<void> | null = null
  private persistChain: Promise<void> = Promise.resolve()
  constructor(private readonly userDataPath: string, private readonly aiConfiguration: LocalAiConfiguration) {}
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
      this.jobs = Array.isArray(stored.jobs) ? stored.jobs.slice(0, 50).map(job => ["queued", "running"].includes(job.status) ? { ...job, status: "failed" as const, currentQuestion: undefined, finishedAt: new Date().toISOString(), errors: [...job.errors, { questionNo: job.currentQuestion ?? "—", message: "Job was interrupted when GetGo Tools stopped." }] } : job) : []
    } catch { this.jobs = [] }
    await this.persist()
    // Backfill old global history into each quiz so migration state travels with
    // the repository even when it is opened on another machine.
    await Promise.allSettled(this.jobs.map(job => this.persistQuizJob(job)))
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

  async start(input: { manifestPath: string; context: Record<string, unknown> }) {
    await this.ensureLoaded()
    const quizId = String(input.context.quizId ?? "")
    const contestId = String(input.context.contestId ?? "")
    if (!quizId || !contestId || !path.isAbsolute(input.manifestPath)) throw new Error("Invalid quiz migration job.")
    const duplicate = this.jobs.find(job => job.quizId === quizId && job.contestId === contestId && ["queued", "running"].includes(job.status))
    if (duplicate) return duplicate
    const records = await loadQuizQuestions(input.manifestPath)
    const job: AiMigrationJob = {
      id: randomUUID(), contestId, quizId, quizTitle: String(input.context.title ?? quizId), manifestPath: input.manifestPath, context: input.context,
      status: "queued", total: records.filter(record => !questionIsVerified(record) && !questionContainsImages(record)).length,
      processed: 0, succeeded: 0, failed: 0,
      skippedImages: records.filter(record => !questionIsVerified(record) && questionContainsImages(record)).length,
      skippedVerified: records.filter(questionIsVerified).length,
      errors: [], createdAt: new Date().toISOString(),
    }
    this.jobs.unshift(job); await this.persistJob(job); this.schedule(); return structuredClone(job)
  }

  async cancel(id: string) {
    await this.ensureLoaded()
    const job = this.jobs.find(item => item.id === id)
    if (!job || !["queued", "running"].includes(job.status)) return this.snapshot()
    const runtime = this.runtimes.get(id)
    if (runtime) { runtime.cancelled = true; runtime.service.cancelDynamicQuestionAi() }
    job.status = "cancelled"; job.currentQuestion = undefined; job.finishedAt = new Date().toISOString()
    await this.persistJob(job); this.schedule(); return this.snapshot()
  }

  private schedule() {
    const capacity = this.concurrency - this.runtimes.size
    if (capacity <= 0) return
    for (const job of this.jobs.filter(item => item.status === "queued").slice(0, capacity)) void this.run(job, job.context ?? { contestId: job.contestId, quizId: job.quizId, title: job.quizTitle })
  }

  private async run(job: AiMigrationJob, context: Record<string, unknown>) {
    const service = new LocalAiService(this.aiConfiguration)
    const runtime: RuntimeJob = { service, cancelled: false }
    this.runtimes.set(job.id, runtime); job.status = "running"; job.startedAt = new Date().toISOString(); await this.persistJob(job)
    try {
      const initial = await loadQuizQuestions(job.manifestPath)
      const queue = initial.filter(record => !questionIsVerified(record) && !questionContainsImages(record))
      for (const queued of queue) {
        if (runtime.cancelled) break
        const latest = (await loadQuizQuestions(job.manifestPath)).find(record => String(record.question_no) === String(queued.question_no))
        if (!latest || questionIsVerified(latest) || questionContainsImages(latest)) { job.processed += 1; if (latest && questionIsVerified(latest)) job.skippedVerified += 1; else if (latest && questionContainsImages(latest)) job.skippedImages += 1; await this.persistJob(job); continue }
        job.currentQuestion = String(latest.question_no); await this.persistJob(job)
        const startedAt = Date.now()
        try {
          const result = await service.createDynamicQuestionProposal({ question: latest, context })
          if (runtime.cancelled) break
          const current = (await loadQuizQuestions(job.manifestPath)).find(record => String(record.question_no) === String(latest.question_no))
          if (!current || questionIsVerified(current)) { job.processed += 1; job.skippedVerified += current && questionIsVerified(current) ? 1 : 0; await this.persistJob(job); continue }
          const proposal = result.proposal
          await saveQuizQuestion(job.manifestPath, withQuestionStatus({ ...current, authoringMode: "advanced-dynamic", advancedDynamic: { ...current.advancedDynamic, paramsGeneratorTs: proposal.paramsGeneratorTs, questionGeneratorTs: proposal.questionGeneratorTs, originParamsTs: proposal.originParamsTs, explanationGeneratorTs: proposal.explanationGeneratorTs }, aiResponse: { ...result, generatedAt: new Date().toISOString(), processingTimeMs: Date.now() - startedAt } } as QuizQuestionRecord, "pending"))
          job.succeeded += 1
        } catch (cause) {
          if (runtime.cancelled) break
          job.failed += 1; job.errors.push({ questionNo: String(latest.question_no), message: cause instanceof Error ? cause.message : String(cause) })
        }
        job.processed += 1; await this.persistJob(job)
      }
      if (!runtime.cancelled) job.status = "completed"
    } catch (cause) {
      if (!runtime.cancelled) { job.status = "failed"; job.errors.push({ questionNo: job.currentQuestion ?? "—", message: cause instanceof Error ? cause.message : String(cause) }) }
    } finally {
      job.currentQuestion = undefined; job.finishedAt ??= new Date().toISOString(); this.runtimes.delete(job.id); await this.persistJob(job); this.schedule()
    }
  }
}
