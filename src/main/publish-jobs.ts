import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BackgroundJob } from "../core/models.js";

type PublishJob = BackgroundJob & { kind: "publish" };
export interface PublishJobControl { checkpoint(): Promise<void> }
interface Runtime { paused: boolean; cancelled: boolean; resume?: () => void }

export class PublishJobManager {
  private jobs: PublishJob[] = [];
  private loadPromise: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private runtimes = new Map<string, Runtime>();

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
          ? { ...job, status: "failed", cancellable: false, finishedAt: new Date().toISOString(), error: "Job was interrupted when GetGo Tools stopped." }
          : job,
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
    input: Pick<PublishJob, "name" | "description" | "route">,
    task: (control: PublishJobControl) => Promise<void>,
  ): Promise<PublishJob> {
    const job = await this.create(input);
    void this.run(job, task).catch(() => undefined);
    return structuredClone(job);
  }

  async track<T>(
    input: Pick<PublishJob, "name" | "description" | "route">,
    task: (control: PublishJobControl) => Promise<T>,
  ): Promise<T> {
    const job = await this.create(input);
    return this.run(job, task);
  }

  private async create(
    input: Pick<PublishJob, "name" | "description" | "route">,
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
      total: 1,
      progressLabel: "Waiting",
      cancellable: true,
      createdAt: new Date().toISOString(),
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
    job.finishedAt = new Date().toISOString();
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
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.progressLabel = "Publishing";
    await this.persist();
    try {
      const result = await task({ checkpoint });
      await checkpoint();
      job.status = "completed";
      job.completed = 1;
      job.progressLabel = "Published";
      return result;
    } catch (cause) {
      if (!runtime.cancelled) {
        job.status = "failed";
        job.error = cause instanceof Error ? cause.message : String(cause);
        job.progressLabel = "Failed";
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
