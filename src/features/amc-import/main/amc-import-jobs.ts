import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackgroundJob } from "../../../shared/domain/models.js";
import type { StartAmcImportInput } from "../domain/amc-import.js";
import type { AmcImportService } from "./amc-import-service.js";

type AmcImportJob = BackgroundJob & { kind: "amc-import"; input: StartAmcImportInput };
interface Runtime { paused: boolean; cancelled: boolean; resume?: () => void }

export class AmcImportJobManager {
  private jobs: AmcImportJob[] = [];
  private loaded: Promise<void> | null = null;
  private persistChain = Promise.resolve();
  private activeJobId: string | null = null;
  private runtimes = new Map<string, Runtime>();

  constructor(private readonly userDataPath: string, private readonly service: AmcImportService) {}

  private get filePath() { return path.join(this.userDataPath, "amc-import-jobs.json"); }
  private ensureLoaded() { this.loaded ??= this.load(); return this.loaded; }
  private async load() {
    try {
      const stored = JSON.parse(await fs.readFile(this.filePath, "utf8")) as { jobs?: AmcImportJob[] };
      this.jobs = (stored.jobs ?? []).slice(0, 100).map((job) => ["queued", "running", "paused"].includes(job.status)
        ? { ...job, status: "failed", cancellable: false, retryable: true, error: "Job was interrupted when GetGo Tools stopped.", finishedAt: new Date().toISOString() }
        : job);
    } catch { this.jobs = []; }
    await this.persist();
  }
  private async persist() {
    const contents = JSON.stringify({ jobs: this.jobs.slice(0, 100) }, null, 2);
    this.persistChain = this.persistChain.then(async () => {
      await fs.mkdir(this.userDataPath, { recursive: true });
      await fs.writeFile(this.filePath, contents, "utf8");
    });
    await this.persistChain;
  }
  private log(job: AmcImportJob, stream: "system" | "stdout" | "stderr", message: string) {
    job.logs ??= [];
    job.logs.push({ timestamp: new Date().toISOString(), stream, message });
  }
  async list(): Promise<AmcImportJob[]> { await this.ensureLoaded(); return structuredClone(this.jobs); }
  async start(input: StartAmcImportInput): Promise<AmcImportJob> {
    await this.ensureLoaded();
    const scope = input.scope === "all" ? "all contests" : input.scope === "topic" ? input.contest! : `${input.year} ${input.contest}`;
    const job: AmcImportJob = {
      id: randomUUID(), kind: "amc-import", input: structuredClone(input), name: `AMC import · ${scope}`,
      description: input.scope === "quiz" ? "Import one AoPS quiz" : input.scope === "topic" ? "Import every quiz in this contest" : "Import the complete discovered AoPS archive",
      route: "/amc-import", status: "queued", completed: 0, total: 1, progressLabel: "Waiting for earlier AMC imports",
      cancellable: true, retryable: false, createdAt: new Date().toISOString(), logs: [],
    };
    this.log(job, "system", "AMC import queued. AMC imports run one at a time.");
    this.jobs.unshift(job);
    await this.persist();
    this.pump();
    return structuredClone(job);
  }
  private pump() {
    if (this.activeJobId) return;
    const next = [...this.jobs].reverse().find((job) => job.status === "queued");
    if (!next) return;
    this.activeJobId = next.id;
    void this.run(next).finally(() => { this.activeJobId = null; this.pump(); });
  }
  private async run(job: AmcImportJob) {
    const runtime: Runtime = { paused: false, cancelled: false };
    this.runtimes.set(job.id, runtime);
    const checkpoint = async () => {
      if (runtime.paused) await new Promise<void>((resolve) => { runtime.resume = resolve; });
      runtime.resume = undefined;
      if (runtime.cancelled) throw new Error("AMC import was cancelled.");
    };
    job.status = "running"; job.startedAt = new Date().toISOString(); job.progressLabel = "Preparing import";
    this.log(job, "system", "AMC import started."); await this.persist();
    try {
      await this.service.start(job.input, {
        checkpoint,
        setTotal: async (total, label) => { job.total = Math.max(1, total); job.progressLabel = label; this.log(job, "stdout", label); await this.persist(); },
        report: async (label) => { job.progressLabel = label; this.log(job, "stdout", label); await this.persist(); await checkpoint(); },
        advance: async (label) => { job.completed = Math.min(job.total, job.completed + 1); job.progressLabel = label; this.log(job, "stdout", label); await this.persist(); await checkpoint(); },
      });
      await checkpoint();
      job.status = "completed"; job.completed = job.total; job.progressLabel = "Import completed";
      this.log(job, "system", "AMC import completed.");
    } catch (cause) {
      if (!runtime.cancelled) {
        job.status = "failed"; job.error = cause instanceof Error ? cause.message : String(cause); job.progressLabel = "Import failed"; job.retryable = true;
        this.log(job, "stderr", job.error);
      }
    } finally {
      job.finishedAt = new Date().toISOString(); job.cancellable = false; this.runtimes.delete(job.id); await this.persist();
    }
  }
  async pause(id: string) {
    await this.ensureLoaded(); const job = this.jobs.find((item) => item.id === id); if (!job || !["queued", "running"].includes(job.status)) return;
    if (job.status === "queued") job.status = "paused";
    else { const runtime = this.runtimes.get(id); if (!runtime) return; runtime.paused = true; job.status = "paused"; }
    job.progressLabel = "Paused"; this.log(job, "system", "AMC import paused."); await this.persist();
  }
  async resume(id: string) {
    await this.ensureLoaded(); const job = this.jobs.find((item) => item.id === id); if (!job || job.status !== "paused") return;
    const runtime = this.runtimes.get(id);
    if (runtime) { runtime.paused = false; job.status = "running"; runtime.resume?.(); }
    else { job.status = "queued"; job.cancellable = true; }
    job.progressLabel = runtime ? "Resuming import" : "Waiting for earlier AMC imports"; this.log(job, "system", "AMC import resumed."); await this.persist(); this.pump();
  }
  async cancel(id: string) {
    await this.ensureLoaded(); const job = this.jobs.find((item) => item.id === id); if (!job || !["queued", "running", "paused"].includes(job.status)) return;
    const runtime = this.runtimes.get(id); if (runtime) { runtime.cancelled = true; runtime.paused = false; runtime.resume?.(); }
    job.status = "cancelled"; job.cancellable = false; job.retryable = true; job.progressLabel = "Cancelled"; job.finishedAt = new Date().toISOString(); this.log(job, "system", "AMC import cancelled."); await this.persist(); this.pump();
  }
  async retry(id: string) { await this.ensureLoaded(); const job = this.jobs.find((item) => item.id === id); if (job && ["failed", "cancelled"].includes(job.status)) await this.start(job.input); }
  async delete(id: string) { await this.ensureLoaded(); const job = this.jobs.find((item) => item.id === id); if (!job || ["queued", "running", "paused"].includes(job.status)) return; this.jobs = this.jobs.filter((item) => item.id !== id); await this.persist(); }
  async clearFinished() { await this.ensureLoaded(); this.jobs = this.jobs.filter((job) => ["queued", "running", "paused"].includes(job.status)); await this.persist(); }
}
