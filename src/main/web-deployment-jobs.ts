import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackgroundJob, DeploymentComponent, WebDeploymentTarget } from "../core/models.js";

type DeploymentJob = BackgroundJob & {
  kind: "deploy";
  component?: DeploymentComponent;
  target?: WebDeploymentTarget;
};
interface Runtime { child: ChildProcess; cancelled: boolean }

const targetScripts: Record<WebDeploymentTarget, string> = {
  development: "deploy:getgo:dev",
  staging: "deploy:getgo:staging",
  production: "deploy:getgo:production",
};

function cleanLine(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").trim().slice(-180);
}

export class WebDeploymentJobManager {
  private jobs: DeploymentJob[] = [];
  private loadPromise: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private runtimes = new Map<string, Runtime>();

  constructor(
    private readonly userDataPath: string,
    private readonly toolsAppPath: string,
  ) {}

  private get filePath() {
    return path.join(this.userDataPath, "web-deployment-jobs.json");
  }

  private ensureLoaded() {
    this.loadPromise ??= this.load();
    return this.loadPromise;
  }

  private async load() {
    try {
      const stored = JSON.parse(await fs.readFile(this.filePath, "utf8")) as { jobs?: DeploymentJob[] };
      this.jobs = (stored.jobs ?? []).slice(0, 50).map((job) =>
        ["queued", "running", "paused"].includes(job.status)
          ? { ...job, status: "failed", cancellable: false, retryable: Boolean(job.component && job.target), finishedAt: new Date().toISOString(), error: "Deployment was interrupted when GetGo Tools stopped." }
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

  private async webRoot() {
    const configured = process.env.GETGO_WEB_ROOT?.trim();
    const candidates = [
      configured,
      path.resolve(this.toolsAppPath, "..", "tnp-getgo-web"),
      path.resolve(process.cwd(), "..", "tnp-getgo-web"),
    ].filter((candidate): candidate is string => Boolean(candidate));
    for (const candidate of [...new Set(candidates)]) {
      try {
        const manifest = JSON.parse(await fs.readFile(path.join(candidate, "package.json"), "utf8")) as { name?: string };
        if (manifest.name === "tnp-getgo-web") return candidate;
      } catch {
        // Try the next deterministic candidate.
      }
    }
    throw new Error("GetGo Web repository was not found. Set GETGO_WEB_ROOT to its absolute path.");
  }

  async start(component: DeploymentComponent, target: WebDeploymentTarget) {
    await this.ensureLoaded();
    if (this.jobs.some((job) => ["queued", "running", "paused"].includes(job.status)))
      throw new Error("Another Web deployment is already active.");
    const webRoot = await this.webRoot();
    const job: DeploymentJob = {
      id: randomUUID(),
      kind: "deploy",
      component,
      target,
      name: `Deploy ${component === "web" ? "Web" : "Firebase rules"} · ${target}`,
      description: component === "web"
        ? `Build and deploy GetGo Web Hosting to ${target}`
        : `Deploy Firestore and Storage rules to ${target}`,
      status: "queued",
      completed: 0,
      total: 1,
      progressLabel: "Starting deployment",
      createdAt: new Date().toISOString(),
      cancellable: true,
      retryable: false,
    };
    this.jobs.unshift(job);
    await this.persist();

    const scope = component === "web" ? "web" : "rules";
    const child = spawn("npm", ["run", targetScripts[target], "--", `--scope=${scope}`], {
      cwd: webRoot,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const runtime: Runtime = { child, cancelled: false };
    this.runtimes.set(job.id, runtime);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.progressLabel = "Building and deploying";
    await this.persist();

    const updateOutput = (chunk: Buffer) => {
      const line = cleanLine(chunk.toString("utf8").split(/\r?\n/).filter(Boolean).at(-1) ?? "");
      if (!line || runtime.cancelled) return;
      job.progressLabel = line;
      void this.persist();
    };
    child.stdout?.on("data", updateOutput);
    child.stderr?.on("data", updateOutput);
    child.once("error", (cause) => void this.finish(job, runtime, null, cause));
    child.once("close", (code) => void this.finish(job, runtime, code, null));
    return structuredClone(job);
  }

  private async finish(job: DeploymentJob, runtime: Runtime, code: number | null, cause: Error | null) {
    if (this.runtimes.get(job.id) !== runtime) return;
    this.runtimes.delete(job.id);
    if (!runtime.cancelled) {
      if (!cause && code === 0) {
        job.status = "completed";
        job.completed = 1;
        job.progressLabel = "Deployed";
      } else {
        job.status = "failed";
        job.error = cause?.message ?? `Deployment exited with code ${code ?? "unknown"}.`;
        job.progressLabel = "Failed";
        job.retryable = true;
      }
    }
    job.cancellable = false;
    job.finishedAt ??= new Date().toISOString();
    await this.persist();
  }

  private signal(runtime: Runtime, signal: NodeJS.Signals) {
    if (runtime.child.pid === undefined) return;
    if (process.platform === "win32") {
      if (signal !== "SIGTERM") throw new Error("Pause and resume are not supported on Windows.");
      runtime.child.kill(signal);
      return;
    }
    process.kill(-runtime.child.pid, signal);
  }

  async pause(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "running") return;
    this.signal(runtime, "SIGSTOP");
    job.status = "paused";
    job.progressLabel = "Paused";
    await this.persist();
  }

  async resume(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "paused") return;
    this.signal(runtime, "SIGCONT");
    job.status = "running";
    job.progressLabel = "Building and deploying";
    await this.persist();
  }

  async cancel(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || !["queued", "running", "paused"].includes(job.status)) return;
    runtime.cancelled = true;
    if (job.status === "paused") this.signal(runtime, "SIGCONT");
    this.signal(runtime, "SIGTERM");
    job.status = "cancelled";
    job.progressLabel = "Cancelled";
    job.cancellable = false;
    job.retryable = true;
    job.finishedAt = new Date().toISOString();
    await this.persist();
  }

  async retry(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    if (!job?.retryable || !job.component || !job.target) return;
    await this.start(job.component, job.target);
  }

  async delete(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    if (!job || ["queued", "running", "paused"].includes(job.status)) return;
    this.jobs = this.jobs.filter((item) => item.id !== id);
    await this.persist();
  }
}
