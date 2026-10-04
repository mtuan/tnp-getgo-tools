import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackgroundJob, ReleaseDoctorCheck, ReleaseDoctorSnapshot, WebDeploymentTarget } from "../../../shared/domain/models.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";
import { spawnCommand } from "../../../shared/main/spawn-command.js";

type ReleaseTarget = Exclude<WebDeploymentTarget, "development">;
type ReleaseJob = BackgroundJob & { component: "release"; target: ReleaseTarget; operation: "deploy" };
type Runtime = { child?: ChildProcess; cancelled: boolean; buffers: Record<"stdout" | "stderr", string> };

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const activeStatuses = new Set(["queued", "running", "paused"]);
const targetScripts: Record<ReleaseTarget, string> = {
  staging: "deploy:getgo:staging",
  production: "deploy:getgo:production",
};

export function fullReleaseCommands(target: ReleaseTarget) {
  return [
    { label: "Deploying Web and Firebase", args: ["run", targetScripts[target]] },
    { label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", target] },
    { label: target === "staging" ? "Uploading Android to Internal testing" : "Uploading Android production draft", args: ["run", "native:deploy:android", "--", target] },
  ];
}

function cleanLine(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, "").trim().slice(-4000);
}

function usefulDetails(output: string, limit = 250) {
  const lines = output.split(/\r?\n/).map(cleanLine).filter(Boolean);
  if (lines.length <= limit) return lines;
  return [`… ${lines.length - limit} earlier diagnostic lines omitted`, ...lines.slice(-limit)];
}

export class FullReleaseJobManager {
  private jobs: ReleaseJob[] = [];
  private loaded: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private runtimes = new Map<string, Runtime>();

  constructor(private readonly userDataPath: string, private readonly toolsAppPath: string) {}

  private get filePath() { return path.join(this.userDataPath, "full-release-jobs.json"); }
  private ensureLoaded() { return this.loaded ??= this.load(); }

  private async load() {
    try { this.jobs = (JSON.parse(await fs.readFile(this.filePath, "utf8")) as ReleaseJob[]).slice(0, 30); }
    catch { this.jobs = []; }
    for (const job of this.jobs) {
      if (!activeStatuses.has(job.status)) continue;
      job.status = "failed";
      job.error = "Release was interrupted when GetGo Tools stopped.";
      job.progressLabel = "Interrupted";
      job.cancellable = false;
      job.retryable = true;
      job.finishedAt = new Date().toISOString();
    }
    await this.persist();
  }

  private async persist() {
    const contents = JSON.stringify(this.jobs.slice(0, 30), null, 2);
    this.persistChain = this.persistChain.then(async () => {
      await fs.mkdir(this.userDataPath, { recursive: true });
      await fs.writeFile(this.filePath, contents, "utf8");
    });
    await this.persistChain;
  }

  private async webRoot() {
    const root = await findRelatedRepository(this.toolsAppPath, {
      packageName: "tnp-getgo-web",
      directoryName: "tnp-getgo-web",
      environmentVariable: "GETGO_WEB_ROOT",
    });
    if (root) return root;
    throw new Error("GetGo Web repository was not found. Set GETGO_WEB_ROOT to its absolute path.");
  }

  private runCapture(root: string, args: string[], executable = npmExecutable, environment: NodeJS.ProcessEnv = process.env) {
    return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
      const child = spawnCommand(executable, args, { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
      child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
      child.once("error", reject);
      child.once("close", code => resolve({ code, output }));
    });
  }

  private async webDoctor(root: string, target: ReleaseTarget): Promise<ReleaseDoctorCheck> {
    const targetName = target === "staging" ? "getgo-staging" : "getgo";
    const directory = path.join(root, "configs", "deploys", targetName);
    try {
      const config = JSON.parse(await fs.readFile(path.join(directory, "target.json"), "utf8")) as {
        firebaseProject?: string;
        firebaseConfig?: string;
        resourceDir?: string;
      };
      const resourceDirectory = path.resolve(root, config.resourceDir ?? `configs/deploys/${targetName}`);
      const firebaseConfigPath = path.resolve(root, config.firebaseConfig ?? path.join(resourceDirectory, "firebase.json"));
      await Promise.all([
        fs.access(path.join(directory, ".env")), fs.access(firebaseConfigPath),
        fs.access(path.join(resourceDirectory, "firestore.rules")), fs.access(path.join(resourceDirectory, "firestore.indexes.json")),
        fs.access(path.join(resourceDirectory, "storage.rules")),
      ]);
      const git = await this.runCapture(root, ["status", "--short"], "git");
      if (git.code !== 0) throw new Error(usefulDetails(git.output).join("\n") || "Could not inspect the Git worktree.");
      if (git.output.trim()) {
        return { id: "web", status: "action-required", title: "Web and Firebase", summary: "Commit or stash local changes before releasing.", details: [`Repository: ${root}`, "$ git status --short", ...usefulDetails(git.output)] };
      }
      const firebase = await this.runCapture(root, ["exec", "--", "firebase", "projects:list", "--json"]);
      if (firebase.code !== 0) {
        return { id: "web", status: "action-required", title: "Web and Firebase", summary: "Firebase CLI authentication is required.", details: [`Repository: ${root}`, `Firebase project: ${config.firebaseProject ?? targetName}`, "$ npm exec -- firebase projects:list --json", `Exit code: ${firebase.code ?? "unknown"}`, ...usefulDetails(firebase.output)] };
      }
      const jsonStart = firebase.output.search(/\{\s*"(?:status|result)"/);
      if (jsonStart < 0) throw new Error("Firebase CLI returned an unreadable project list.");
      const firebaseJson = firebase.output.slice(jsonStart);
      const firebaseProjects = JSON.parse(firebaseJson) as { result?: Array<{ projectId?: string }> };
      if (!firebaseProjects.result?.some(project => project.projectId === config.firebaseProject)) {
        return { id: "web", status: "action-required", title: "Web and Firebase", summary: `The signed-in Firebase account cannot access ${config.firebaseProject ?? targetName}.`, details: [`Repository: ${root}`, `Required Firebase project: ${config.firebaseProject ?? targetName}`, "$ npm exec -- firebase projects:list --json", ...usefulDetails(firebase.output)] };
      }
      return { id: "web", status: "ready", title: "Web and Firebase", summary: `${config.firebaseProject ?? targetName} configuration and Firebase access are ready.`, details: [] };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      return { id: "web", status: "action-required", title: "Web and Firebase", summary: error.message, details: [`Repository: ${root}`, `Deployment configuration: ${directory}`, ...usefulDetails(error.stack ?? error.message)] };
    }
  }

  private async nativeDoctor(root: string, target: ReleaseTarget, platform: "ios" | "android"): Promise<ReleaseDoctorCheck> {
    const result = await this.runCapture(root, ["run", "native:doctor", "--", platform, target]);
    const title = platform === "ios" ? "iOS and TestFlight" : "Android and Google Play";
    return result.code === 0
      ? { id: platform, status: "ready", title, summary: `${platform === "ios" ? "TestFlight" : target === "staging" ? "Internal testing" : "Production draft"} prerequisites are ready.`, details: [] }
      : { id: platform, status: "action-required", title, summary: `Complete the ${platform === "ios" ? "iOS" : "Android"} requirements below.`, details: [`Repository: ${root}`, `$ npm run native:doctor -- ${platform} ${target}`, `Exit code: ${result.code ?? "unknown"}`, ...usefulDetails(result.output)] };
  }

  async doctor(target: ReleaseTarget): Promise<ReleaseDoctorSnapshot> {
    const root = await this.webRoot();
    const checks = await Promise.all([
      this.webDoctor(root, target),
      this.nativeDoctor(root, target, "ios"),
      this.nativeDoctor(root, target, "android"),
    ]);
    return { target, checkedAt: new Date().toISOString(), ready: checks.every(check => check.status === "ready"), checks };
  }

  async list() { await this.ensureLoaded(); return structuredClone(this.jobs); }

  async start(target: ReleaseTarget) {
    await this.ensureLoaded();
    if (this.jobs.some(job => activeStatuses.has(job.status))) throw new Error("Another full release is already active.");
    const readiness = await this.doctor(target);
    if (!readiness.ready) throw new Error("Release Doctor found requirements that still need attention.");
    const job: ReleaseJob = {
      id: randomUUID(), kind: "deploy", deploymentProduct: "web", component: "release", operation: "deploy", target,
      name: `Full GetGo release · ${target}`,
      description: `Deploy Firebase and Web, then upload iOS to TestFlight and Android to ${target === "staging" ? "Internal testing" : "the Production draft"}`,
      status: "queued", completed: 0, total: 3, progressLabel: "Starting release", createdAt: new Date().toISOString(),
      cancellable: true, retryable: false,
      logs: [{ timestamp: new Date().toISOString(), stream: "system", message: "Full release queued after Release Doctor passed." }],
    };
    this.jobs.unshift(job);
    await this.persist();
    void this.run(job);
    return structuredClone(job);
  }

  private async run(job: ReleaseJob) {
    const root = await this.webRoot();
    const runtime: Runtime = { cancelled: false, buffers: { stdout: "", stderr: "" } };
    this.runtimes.set(job.id, runtime);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    await this.persist();
    const commands = fullReleaseCommands(job.target);
    try {
      for (const [index, command] of commands.entries()) {
        if (runtime.cancelled) return;
        job.progressLabel = command.label;
        job.logs?.push({ timestamp: new Date().toISOString(), stream: "system", message: `$ npm ${command.args.join(" ")}` });
        const code = await this.runCommand(job, runtime, root, command.args);
        if (runtime.cancelled) return;
        if (code !== 0) throw new Error(`${command.label} failed with exit code ${code ?? "unknown"}.`);
        job.completed = index + 1;
        await this.persist();
      }
      job.status = "completed";
      job.progressLabel = "Release uploaded";
      job.cancellable = false;
      job.finishedAt = new Date().toISOString();
      job.logs?.push({ timestamp: job.finishedAt, stream: "system", message: "Full release completed." });
    } catch (cause) {
      if (!runtime.cancelled) {
        job.status = "failed";
        job.error = cause instanceof Error ? cause.message : String(cause);
        job.progressLabel = "Release stopped";
        job.cancellable = false;
        job.retryable = true;
        job.finishedAt = new Date().toISOString();
        job.logs?.push({ timestamp: job.finishedAt, stream: "stderr", message: job.error });
      }
    } finally {
      this.runtimes.delete(job.id);
      if (job.startedAt && job.finishedAt) job.durationMs = Math.max(0, Date.parse(job.finishedAt) - Date.parse(job.startedAt));
      await this.persist();
    }
  }

  private runCommand(job: ReleaseJob, runtime: Runtime, root: string, args: string[]) {
    return new Promise<number | null>((resolve, reject) => {
      const child = spawnCommand(npmExecutable, args, { cwd: root, env: process.env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
      runtime.child = child;
      const consume = (stream: "stdout" | "stderr", chunk: Buffer) => {
        const value = runtime.buffers[stream] + chunk.toString("utf8");
        const lines = value.split(/\r?\n/);
        runtime.buffers[stream] = lines.pop() ?? "";
        for (const raw of lines) {
          const message = cleanLine(raw);
          if (!message) continue;
          job.logs?.push({ timestamp: new Date().toISOString(), stream, message });
          job.progressLabel = message;
        }
        if ((job.logs?.length ?? 0) > 2500) job.logs = job.logs!.slice(-2500);
        void this.persist();
      };
      child.stdout?.on("data", (chunk: Buffer) => consume("stdout", chunk));
      child.stderr?.on("data", (chunk: Buffer) => consume("stderr", chunk));
      child.once("error", reject);
      child.once("close", resolve);
    });
  }

  private terminate(runtime: Runtime) {
    if (!runtime.child?.pid) return;
    if (process.platform === "win32") runtime.child.kill();
    else process.kill(-runtime.child.pid, "SIGTERM");
  }

  async cancel(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || !activeStatuses.has(job.status)) return;
    runtime.cancelled = true;
    this.terminate(runtime);
    job.status = "cancelled";
    job.progressLabel = "Release cancelled";
    job.cancellable = false;
    job.retryable = true;
    job.finishedAt = new Date().toISOString();
    await this.persist();
  }

  async pause(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime?.child?.pid || job.status !== "running" || process.platform === "win32") return;
    process.kill(-runtime.child.pid, "SIGSTOP");
    job.status = "paused";
    job.progressLabel = "Release paused";
    await this.persist();
  }

  async resume(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime?.child?.pid || job.status !== "paused" || process.platform === "win32") return;
    process.kill(-runtime.child.pid, "SIGCONT");
    job.status = "running";
    job.progressLabel = "Release resumed";
    await this.persist();
  }

  async retry(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find(item => item.id === id);
    if (job?.retryable) await this.start(job.target);
  }

  async delete(id: string) {
    await this.ensureLoaded();
    if (this.runtimes.has(id)) throw new Error("Cancel the release before deleting it.");
    this.jobs = this.jobs.filter(item => item.id !== id);
    await this.persist();
  }

  async clearFinished() {
    await this.ensureLoaded();
    this.jobs = this.jobs.filter(job => activeStatuses.has(job.status));
    await this.persist();
  }
}
