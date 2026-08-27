import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackgroundJob, DeploymentOperation, WebDeploymentTarget } from "../../../shared/domain/models.js";

type NativePlatform = "ios" | "android";
type NativeJob = BackgroundJob & { component: "mobile-ios" | "mobile-android" };

interface Runtime { child: ChildProcess; cancelled: boolean; buffers: Record<"stdout" | "stderr", string> }

function cleanOutput(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, "").trimEnd().slice(-4000);
}

function failureSummary(job: NativeJob, fallback: string) {
  const patterns = [
    /\[error\]/i, /(^|\s)error:/i, /enoent/i, /exception:/i,
    /build failed/i, /archive failed/i, /what went wrong/i,
    /no profiles? for/i, /provisioning profile/i, /signing for .* requires/i,
    /exited with code/i,
  ];
  const ignored = [/^\s*at\s/, /^\s*\^/, /^node\.js\s/i, /^file:\/\//i];
  const errors = (job.logs ?? [])
    .filter(log => log.stream === "stderr" || patterns.some(pattern => pattern.test(log.message)))
    .map(log => log.message.replace(/^\[error\]\s*/i, "").trim())
    .filter(message => message && !ignored.some(pattern => pattern.test(message)))
    .filter((message, index, values) => values.indexOf(message) === index)
    .slice(-12);
  return errors.length ? errors.join("\n") : fallback;
}

export class NativeDeploymentJobManager {
  private jobs: NativeJob[] = [];
  private loaded: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private runtimes = new Map<string, Runtime>();

  constructor(private readonly userDataPath: string, private readonly toolsAppPath: string) {}

  private get filePath() { return path.join(this.userDataPath, "native-deployment-jobs.json"); }
  private ensureLoaded() { return this.loaded ??= this.load(); }

  private async load() {
    try {
      this.jobs = (JSON.parse(await fs.readFile(this.filePath, "utf8")) as NativeJob[]).slice(0, 50);
    } catch { this.jobs = []; }
    for (const job of this.jobs) {
      if (["queued", "running", "paused"].includes(job.status)) {
        job.status = "failed";
        job.error = "Native deployment was interrupted when GetGo Tools stopped.";
        job.cancellable = false;
        job.retryable = true;
        job.finishedAt = new Date().toISOString();
      }
    }
    await this.persist();
  }

  private async persist() {
    const contents = JSON.stringify(this.jobs.slice(0, 50), null, 2);
    this.persistChain = this.persistChain.then(async () => {
      await fs.mkdir(this.userDataPath, { recursive: true });
      await fs.writeFile(this.filePath, contents, "utf8");
    });
    await this.persistChain;
  }

  private async webRoot() {
    const candidates = [
      process.env.GETGO_WEB_ROOT?.trim(),
      path.resolve(this.toolsAppPath, "..", "tnp-getgo-web"),
      path.resolve(process.cwd(), "..", "tnp-getgo-web"),
    ].filter((value): value is string => Boolean(value));
    for (const candidate of [...new Set(candidates)]) {
      try {
        const value = JSON.parse(await fs.readFile(path.join(candidate, "package.json"), "utf8")) as { name?: string };
        if (value.name === "tnp-getgo-web") return candidate;
      } catch { /* Try the next candidate. */ }
    }
    throw new Error("GetGo Web repository was not found. Set GETGO_WEB_ROOT to its absolute path.");
  }

  async list() { await this.ensureLoaded(); return structuredClone(this.jobs); }

  async start(operation: DeploymentOperation, platform: NativePlatform, target: WebDeploymentTarget) {
    await this.ensureLoaded();
    const component = `mobile-${platform}` as NativeJob["component"];
    if (this.jobs.some(job => ["queued", "running", "paused"].includes(job.status))) {
      throw new Error("Another native job is already active. iOS and Android builds share the Web bundle and cannot run concurrently.");
    }
    const job: NativeJob = {
      id: randomUUID(), kind: "deploy", component, operation, target,
      name: `${operation === "build" ? "Build" : "Deploy"} Capacitor ${platform === "ios" ? "iOS" : "Android"} · ${target}`,
      description: operation === "build"
        ? `Compile and sign the ${target} Capacitor ${platform} artifact`
        : `Build if required and upload the ${target} Capacitor ${platform} artifact`,
      status: "queued", completed: 0, total: 4, progressLabel: "Starting native workflow",
      createdAt: new Date().toISOString(), cancellable: true, retryable: false,
      logs: [{ timestamp: new Date().toISOString(), stream: "system", message: "Native workflow queued." }],
    };
    this.jobs.unshift(job);
    await this.persist();
    await this.run(job, platform);
    return structuredClone(job);
  }

  private async run(job: NativeJob, platform: NativePlatform) {
    const root = await this.webRoot();
    const command = `native:${job.operation}:${platform}`;
    const child = spawn("npm", ["run", command, "--", job.target!], {
      cwd: root, env: process.env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    });
    const runtime: Runtime = { child, cancelled: false, buffers: { stdout: "", stderr: "" } };
    this.runtimes.set(job.id, runtime);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.logs?.push({ timestamp: job.startedAt, stream: "system", message: `$ npm run ${command} -- ${job.target}` });
    await this.persist();
    const output = (stream: "stdout" | "stderr", chunk: Buffer) => {
      const value = runtime.buffers[stream] + chunk.toString("utf8");
      const parts = value.split(/\r?\n/);
      runtime.buffers[stream] = parts.pop() ?? "";
      const lines = parts.map(cleanOutput).filter(Boolean);
      for (const message of lines) {
        job.logs?.push({ timestamp: new Date().toISOString(), stream, message });
        if (message.startsWith("GETGO_NATIVE_METADATA ")) {
          try {
            const metadata = JSON.parse(message.slice("GETGO_NATIVE_METADATA ".length)) as { version?: string; buildNumber?: string };
            job.version = metadata.version;
            job.buildNumber = metadata.buildNumber;
          } catch { /* Keep the output line; invalid metadata must not stop the build. */ }
        }
      }
      if ((job.logs?.length ?? 0) > 1500) job.logs = job.logs!.slice(-1500);
      if (lines.at(-1)) job.progressLabel = lines.at(-1)!.slice(-500);
      job.completed = Math.min(job.total - 1, job.completed + 1);
      void this.persist();
    };
    child.stdout?.on("data", chunk => output("stdout", chunk));
    child.stderr?.on("data", chunk => output("stderr", chunk));
    child.once("error", cause => void this.finish(job, runtime, null, cause));
    child.once("close", code => void this.finish(job, runtime, code, null));
  }

  private async finish(job: NativeJob, runtime: Runtime, code: number | null, cause: Error | null) {
    if (this.runtimes.get(job.id) !== runtime) return;
    for (const stream of ["stdout", "stderr"] as const) {
      const message = cleanOutput(runtime.buffers[stream]);
      if (message) job.logs?.push({ timestamp: new Date().toISOString(), stream, message });
    }
    this.runtimes.delete(job.id);
    if (!runtime.cancelled) {
      job.status = !cause && code === 0 ? "completed" : "failed";
      const fallback = cause?.message ?? `Native workflow exited with code ${code ?? "unknown"}.`;
      job.error = job.status === "failed" ? failureSummary(job, fallback) : undefined;
      job.progressLabel = job.status === "completed" ? (job.operation === "build" ? "Built" : "Uploaded") : "Failed";
      job.completed = job.status === "completed" ? job.total : job.completed;
      job.retryable = job.status === "failed";
    }
    job.logs?.push({ timestamp: new Date().toISOString(), stream: "system", message: job.status === "completed" ? "Native workflow completed." : job.error ?? `Native workflow ${job.status}.` });
    job.cancellable = false;
    job.finishedAt = new Date().toISOString();
    await this.persist();
  }

  async open(platform: NativePlatform, target: WebDeploymentTarget) {
    const root = await this.webRoot();
    const child = spawn("npm", ["run", `native:open:${platform}`, "--", target], {
      cwd: root, env: process.env, detached: true, stdio: "ignore",
    });
    child.unref();
  }

  private signal(runtime: Runtime, signal: NodeJS.Signals = "SIGTERM") {
    if (!runtime.child.pid) return;
    if (process.platform === "win32") runtime.child.kill();
    else process.kill(-runtime.child.pid, signal);
  }

  async cancel(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime) return;
    runtime.cancelled = true;
    this.signal(runtime);
    this.runtimes.delete(id);
    job.status = "cancelled"; job.cancellable = false; job.retryable = true;
    job.progressLabel = "Cancelled"; job.finishedAt = new Date().toISOString();
    job.logs?.push({ timestamp: job.finishedAt, stream: "system", message: "Native workflow cancelled." });
    await this.persist();
  }

  async retry(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    if (!job || !job.retryable || !job.target || !job.operation) return;
    await this.start(job.operation, job.component === "mobile-ios" ? "ios" : "android", job.target);
  }

  async delete(id: string) {
    await this.ensureLoaded();
    if (this.runtimes.has(id)) throw new Error("Cancel the native job before deleting it.");
    this.jobs = this.jobs.filter(item => item.id !== id);
    await this.persist();
  }

  async pause(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "running" || process.platform === "win32") return;
    this.signal(runtime, "SIGSTOP");
    job.status = "paused";
    job.progressLabel = "Paused";
    await this.persist();
  }

  async resume(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "paused" || process.platform === "win32") return;
    this.signal(runtime, "SIGCONT");
    job.status = "running";
    job.progressLabel = "Resumed";
    await this.persist();
  }
}
