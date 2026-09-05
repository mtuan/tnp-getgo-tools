import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BackgroundJob } from "../../../shared/domain/models.js";

type PublishJob = BackgroundJob & { kind: "publish" };
export interface PublishJobControl {
  checkpoint(): Promise<void>;
  setTotal(total: number, label: string): Promise<void>;
  advance(label: string, amount?: number): Promise<void>;
  report(label: string): Promise<void>;
}
interface Runtime { paused: boolean; cancelled: boolean; resume?: () => void }
type PublishTask = (control: PublishJobControl) => Promise<unknown>;
type PublishInput = Pick<PublishJob, "name" | "description" | "route"> & {
  initialTotal?: number;
  initialProgressLabel?: string;
};

export class PublishJobManager {
  private jobs: PublishJob[] = [];
  private loadPromise: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private runtimes = new Map<string, Runtime>();
  private retryTasks = new Map<string, { input: PublishInput; task: PublishTask }>();

  constructor(private readonly userDataPath: string) {}

  private get filePath() {
    return path.join(this.userDataPath, "publish-jobs.json");
  }

  private ensureLoaded() {
    this.loadPromise ??= this.load();
    return this.loadPromise;
  }

  private async load() {
    try {
      const stored = JSON.parse(await fs.readFile(this.filePath, "utf8")) as { jobs?: PublishJob[] };
      this.jobs = (stored.jobs ?? []).slice(0, 50).map((job) =>
        ["queued", "running"].includes(job.status)
          ? { ...job, status: "failed", cancellable: false, retryable: false, finishedAt: new Date().toISOString(), error: "Job was interrupted when GetGo Tools stopped." }
          : { ...job, retryable: false },
      );
    } catch {
      this.jobs = [];
    }
    await this.persist();
  }

  private async persist() {
    const contents = JSON.stringify({ jobs: this.jobs.slice(0, 50) }, null, 2);
    this.persistChain = this.persistChain.then(async () => {
      await fs.mkdir(this.userDataPath, { recursive: true });
      await fs.writeFile(this.filePath, contents, "utf8");
    });
    await this.persistChain;
  }

  async list() {
    await this.ensureLoaded();
    return structuredClone(this.jobs);
  }

  async start(
    input: PublishInput,
    task: PublishTask,
  ): Promise<PublishJob> {
    const job = await this.create(input);
    this.retryTasks.set(job.id, { input, task });
    void this.run(job, task).catch(() => undefined);
    return structuredClone(job);
  }

  async track<T>(
    input: PublishInput,
    task: (control: PublishJobControl) => Promise<T>,
  ): Promise<T> {
    const job = await this.create(input);
    this.retryTasks.set(job.id, { input, task });
    return this.run(job, task);
  }

  private async create(
    input: PublishInput,
  ): Promise<PublishJob> {
    await this.ensureLoaded();
    const job: PublishJob = {
      id: randomUUID(),
      kind: "publish",
      name: input.name,
      description: input.description,
      route: input.route,
      status: "queued",
      completed: 0,
      total: Math.max(1, Math.floor(input.initialTotal ?? 1)),
      progressLabel: input.initialProgressLabel ?? "Waiting",
      cancellable: true,
      retryable: false,
      createdAt: new Date().toISOString(),
      logs: [{ timestamp: new Date().toISOString(), stream: "system", message: "Publish job queued." }],
    };
    this.jobs.unshift(job);
    await this.persist();
    return job;
  }

  async pause(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "running") return;
    runtime.paused = true;
    job.status = "paused";
    job.progressLabel = "Paused";
    job.logs?.push({ timestamp: new Date().toISOString(), stream: "system", message: "Publish job paused." });
    await this.persist();
  }

  async resume(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "paused") return;
    runtime.paused = false;
    job.status = "running";
    job.progressLabel = "Publishing";
    job.logs?.push({ timestamp: new Date().toISOString(), stream: "system", message: "Publish job resumed." });
    runtime.resume?.();
    await this.persist();
  }

  async cancel(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || !["queued", "running", "paused"].includes(job.status)) return;
    runtime.cancelled = true;
    runtime.paused = false;
    runtime.resume?.();
    job.status = "cancelled";
    job.progressLabel = "Cancelled";
    job.logs?.push({ timestamp: new Date().toISOString(), stream: "system", message: "Publish job cancelled." });
    job.retryable = this.retryTasks.has(id);
    job.finishedAt = new Date().toISOString();
    await this.persist();
  }

  async retry(id: string) {
    await this.ensureLoaded();
    const retry = this.retryTasks.get(id);
    const job = this.jobs.find((item) => item.id === id);
    if (!retry || !job || !["failed", "cancelled"].includes(job.status)) return;
    await this.start(retry.input, retry.task);
  }

  async delete(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    if (!job || ["queued", "running", "paused"].includes(job.status)) return;
    this.jobs = this.jobs.filter((item) => item.id !== id);
    this.retryTasks.delete(id);
    await this.persist();
  }

  async clearFinished() {
    await this.ensureLoaded();
    const active = new Set(["queued", "running", "paused"]);
    const removedIds = this.jobs.filter((job) => !active.has(job.status)).map((job) => job.id);
    this.jobs = this.jobs.filter((job) => active.has(job.status));
    removedIds.forEach((id) => this.retryTasks.delete(id));
    await this.persist();
  }

  private async run<T>(job: PublishJob, task: (control: PublishJobControl) => Promise<T>): Promise<T> {
    const runtime: Runtime = { paused: false, cancelled: false };
    this.runtimes.set(job.id, runtime);
    const checkpoint = async () => {
      if (runtime.paused) await new Promise<void>((resolve) => { runtime.resume = resolve; });
      runtime.resume = undefined;
      if (runtime.cancelled) throw new Error("Publish job was cancelled.");
    };
    const setTotal = async (total: number, label: string) => {
      job.total = Math.max(job.completed, Math.floor(total), 1);
      job.progressLabel = label;
      job.logs?.push({ timestamp: new Date().toISOString(), stream: "stdout", message: label });
      await this.persist();
    };
    const advance = async (label: string, amount = 1) => {
      job.completed = Math.min(job.total, job.completed + Math.max(0, Math.floor(amount)));
      job.progressLabel = label;
      job.logs?.push({ timestamp: new Date().toISOString(), stream: "stdout", message: label });
      await this.persist();
      await checkpoint();
    };
    const report = async (label: string) => {
      job.progressLabel = label;
      job.logs?.push({ timestamp: new Date().toISOString(), stream: "stdout", message: label });
      await this.persist();
      await checkpoint();
    };
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.logs?.push({ timestamp: job.startedAt, stream: "system", message: "Publish job started." });
    if (job.progressLabel === "Waiting") job.progressLabel = "Publishing";
    await this.persist();
    try {
      const result = await task({ checkpoint, setTotal, advance, report });
      await checkpoint();
      job.status = "completed";
      job.completed = job.total;
      job.progressLabel = "Published";
      job.logs?.push({ timestamp: new Date().toISOString(), stream: "system", message: "Publish job completed." });
      return result;
    } catch (cause) {
      if (!runtime.cancelled) {
        job.status = "failed";
        job.error = cause instanceof Error ? cause.message : String(cause);
        job.progressLabel = "Failed";
        job.retryable = true;
        job.logs?.push({ timestamp: new Date().toISOString(), stream: "stderr", message: job.error });
      }
      throw cause;
    } finally {
      job.finishedAt ??= new Date().toISOString();
      job.cancellable = false;
      this.runtimes.delete(job.id);
      await this.persist();
    }
  }
}
