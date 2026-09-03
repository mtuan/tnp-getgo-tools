import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, openSync, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { BackgroundJob, DeploymentProduct, LocalWebRuntimeSnapshot, WebDeploymentTarget } from "../../../shared/domain/models.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";

export interface LocalWebRuntimeConfig {
  product: DeploymentProduct;
  repositoryName: string;
  repositoryDirectory: string;
  repositoryEnvironmentVariable: string;
  url: string;
  healthPath?: string;
  command(target: WebDeploymentTarget): string[];
  warmCommand?: string[];
}

export const getGoWebRuntimeConfig: LocalWebRuntimeConfig = {
  product: "web",
  repositoryName: "tnp-getgo-web",
  repositoryDirectory: "tnp-getgo-web",
  repositoryEnvironmentVariable: "GETGO_WEB_ROOT",
  url: "http://localhost:5173",
  healthPath: "/manifest.json",
  command: () => ["run", "dev:getgo:dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
  warmCommand: ["run", "warm:dev", "--", "--url", "http://localhost:5173"],
};

export const getGoAppRuntimeConfig: LocalWebRuntimeConfig = {
  product: "app",
  repositoryName: "tnp-getgo",
  repositoryDirectory: "tnp-getgo-app",
  repositoryEnvironmentVariable: "GETGO_APP_ROOT",
  url: "http://localhost:8081",
  command: () => ["run", "web", "--", "--port", "8081"],
};
const execFileAsync = promisify(execFile);
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
interface PersistedRuntime {
  pid: number;
  startedAt: string;
}

function runtimeFailureSummary(job: BackgroundJob, fallback: string) {
  const useful = (job.logs ?? [])
    .map(log => log.message.trim())
    .filter(message => /required permissions|incorrect user|entity not authorized|missing required environment|failed to resolve plugin|graphql request failed/i.test(message))
    .filter((message, index, values) => values.indexOf(message) === index);
  const authorization = useful.find(message => /entity not authorized/i.test(message));
  const permission = useful.find(message => /required permissions/i.test(message));
  const configuration = useful.find(message => /missing required environment|failed to resolve plugin/i.test(message));
  return [permission, authorization, configuration].filter(Boolean).join("\n") || useful.at(-1) || fallback;
}

export class LocalWebRuntimeManager {
  private child: ChildProcess | null = null;
  private startedAt: string | null = null;
  private error: string | null = null;
  private readonly stateFile: string;
  private readonly jobFile: string;
  private readonly stdoutFile: string;
  private readonly stderrFile: string;
  private lastJob: BackgroundJob | null = null;
  private lastJobLoaded: Promise<void> | null = null;
  private jobPersistChain: Promise<void> = Promise.resolve();
  private lastConfirmedOnlineAt = 0;
  private warmingUp = false;
  private operation: Promise<LocalWebRuntimeSnapshot> | null = null;

  constructor(
    private readonly toolsAppPath: string,
    userDataPath: string,
    private readonly config: LocalWebRuntimeConfig = getGoWebRuntimeConfig,
  ) {
    const prefix = config.product === "web" ? "local-web-runtime" : "local-app-runtime";
    this.stateFile = path.join(userDataPath, `${prefix}.json`);
    this.jobFile = path.join(userDataPath, `${prefix}-job.json`);
    this.stdoutFile = path.join(userDataPath, `${prefix}.stdout.log`);
    this.stderrFile = path.join(userDataPath, `${prefix}.stderr.log`);
  }

  private async loadLastJob() {
    try {
      this.lastJob = JSON.parse(await fs.readFile(this.jobFile, "utf8")) as BackgroundJob;
    } catch {
      this.lastJob = null;
    }
  }

  private async ensureLastJobLoaded() {
    await (this.lastJobLoaded ??= this.loadLastJob());
  }

  private async persistLastJob() {
    if (!this.lastJob) return;
    const contents = `${JSON.stringify(this.lastJob, null, 2)}\n`;
    this.jobPersistChain = this.jobPersistChain.then(async () => {
      await fs.mkdir(path.dirname(this.jobFile), { recursive: true });
      await fs.writeFile(this.jobFile, contents, "utf8");
    });
    await this.jobPersistChain;
  }

  private async syncOutputLogs() {
    if (!this.lastJob) return;
    const systemLogs = (this.lastJob.logs ?? []).filter(entry => entry.stream === "system");
    const read = async (file: string, stream: "stdout" | "stderr") => {
      try {
        const value = await fs.readFile(file, "utf8");
        return value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, "").split("\n")
          .map(message => message.trimEnd()).filter(Boolean)
          .map(message => ({ timestamp: this.startedAt ?? this.lastJob!.startedAt ?? new Date().toISOString(), stream, message }));
      } catch {
        return [];
      }
    };
    const [stdout, stderr] = await Promise.all([
      read(this.stdoutFile, "stdout"),
      read(this.stderrFile, "stderr"),
    ]);
    this.lastJob.logs = [...systemLogs, ...stdout, ...stderr].slice(-1000);
    const latest = [...stdout, ...stderr].at(-1);
    if (latest && !this.lastJob.progressLabel?.startsWith("Localhost ready"))
      this.lastJob.progressLabel = latest.message.slice(-500);
  }

  private async persistedRuntime(): Promise<PersistedRuntime | null> {
    try {
      const value = JSON.parse(await fs.readFile(this.stateFile, "utf8")) as PersistedRuntime;
      if (!Number.isInteger(value.pid) || value.pid <= 0 || typeof value.startedAt !== "string")
        return null;
      process.kill(value.pid, 0);
      return value;
    } catch {
      await fs.rm(this.stateFile, { force: true }).catch(() => undefined);
      return null;
    }
  }

  private async persist(runtime: PersistedRuntime | null) {
    if (!runtime) {
      await fs.rm(this.stateFile, { force: true });
      return;
    }
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    await fs.writeFile(this.stateFile, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  }

  private async repositoryRoot() {
    const root = await findRelatedRepository(this.toolsAppPath, {
      packageName: this.config.repositoryName,
      directoryName: this.config.repositoryDirectory,
      environmentVariable: this.config.repositoryEnvironmentVariable,
    });
    if (root) return root;
    throw new Error(`GetGo ${this.config.product === "web" ? "Web" : "App"} repository was not found. Set ${this.config.repositoryEnvironmentVariable} to its absolute path.`);
  }

  private async isOnline() {
    // Expo can need several minutes for its first web bundle. Treat its bound
    // Metro port as ready so health probes do not repeatedly abort cold SSR.
    if (this.config.product === "app") return Boolean(await this.listenerPid());
    try {
      const response = await fetch(`${this.config.url}${this.config.healthPath ?? ""}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) this.lastConfirmedOnlineAt = Date.now();
      return response.ok;
    } catch {
      return false;
    }
  }

  private async listenerPid(): Promise<number | null> {
    try {
      const port = new URL(this.config.url).port;
      if (process.platform === "win32") {
        const { stdout } = await execFileAsync("netstat", ["-ano", "-p", "tcp"]);
        const match = stdout.split(/\r?\n/).find(line =>
          new RegExp(`(?:\\]|\\d):${port}\\s+.*\\sLISTENING\\s+\\d+\\s*$`, "i").test(line),
        );
        const pid = Number(match?.trim().split(/\s+/).at(-1));
        return Number.isInteger(pid) && pid > 0 ? pid : null;
      }
      const { stdout } = await execFileAsync("lsof", ["-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"]);
      const pid = Number(stdout.trim().split(/\s+/)[0]);
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }

  private async processGroupId(pid: number): Promise<number | null> {
    if (process.platform === "win32") return null;
    try {
      const { stdout } = await execFileAsync("ps", ["-o", "pgid=", "-p", String(pid)]);
      const pgid = Number(stdout.trim());
      return Number.isInteger(pgid) && pgid > 0 ? pgid : null;
    } catch {
      return null;
    }
  }

  private async signalRuntime(pid: number, signal: NodeJS.Signals) {
    if (process.platform === "win32") {
      await execFileAsync("taskkill", ["/PID", String(pid), "/T", ...(signal === "SIGKILL" ? ["/F"] : [])]);
      return;
    }
    const [targetGroup, toolsGroup] = await Promise.all([
      this.processGroupId(pid),
      this.processGroupId(process.pid),
    ]);
    // npm -> shell -> Vite runs in one process group. Killing only Vite leaves
    // its supervisors alive and can keep or recreate the listener during a
    // restart. Never group-signal when it would include GetGo Tools itself.
    if (targetGroup && targetGroup !== toolsGroup) process.kill(-targetGroup, signal);
    else process.kill(pid, signal);
  }

  private async waitUntilPortFree(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!await this.listenerPid()) return true;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return !await this.listenerPid();
  }

  private async clearExistingRuntime() {
    const persisted = await this.persistedRuntime();
    const managedPid = this.child?.pid ?? persisted?.pid;
    const listenerPid = await this.listenerPid();
    const pid = listenerPid ?? managedPid;
    if (!pid) {
      this.child = null;
      await this.persist(null);
      return;
    }

    await this.signalRuntime(pid, "SIGTERM");
    this.child = null;
    await this.persist(null);
    if (await this.waitUntilPortFree(4_000)) return;

    const remainingPid = await this.listenerPid();
    if (remainingPid) await this.signalRuntime(remainingPid, "SIGKILL");
    if (!await this.waitUntilPortFree(2_000))
      throw new Error(`${this.config.url} remained occupied after stopping its existing process.`);
  }

  private async waitUntilOnline(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isOnline()) return true;
      if (!this.child && this.error) return false;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return await this.isOnline();
  }

  private singleFlight(operation: () => Promise<LocalWebRuntimeSnapshot>) {
    if (this.operation) return this.operation;
    const request = operation();
    this.operation = request;
    void request.finally(() => {
      if (this.operation === request) this.operation = null;
    }).catch(() => undefined);
    return request;
  }

  async state(): Promise<LocalWebRuntimeSnapshot> {
    await this.ensureLastJobLoaded();
    await this.syncOutputLogs();
    if (this.lastJob?.status === "failed") {
      const summary = runtimeFailureSummary(this.lastJob, this.lastJob.error ?? "Local runtime failed.");
      this.lastJob.error = summary;
      this.error = summary;
    }
    const online = await this.isOnline();
    const persisted = await this.persistedRuntime();
    const managed = Boolean(this.child || persisted);
    const pid = this.child?.pid ?? persisted?.pid;
    const startedAt = this.startedAt ?? persisted?.startedAt;
    const recentlyOnline = this.lastConfirmedOnlineAt > 0 && Date.now() - this.lastConfirmedOnlineAt < 6_000;
    return {
      status: !this.warmingUp && (online || (managed && recentlyOnline)) ? "online" : managed ? "starting" : this.error ? "error" : "offline",
      url: this.config.url,
      managed,
      target: this.lastJob?.target ?? "development",
      pid,
      startedAt,
      error: this.error ?? undefined,
      lastJob: this.lastJob ? structuredClone(this.lastJob) : undefined,
    };
  }

  start(operation: "start" | "restart" = "start", target: WebDeploymentTarget = "development") {
    return this.singleFlight(() => this.startInternal(operation, target));
  }

  private async startInternal(operation: "start" | "restart", target: WebDeploymentTarget) {
    await this.ensureLastJobLoaded();
    this.lastConfirmedOnlineAt = 0;
    await this.clearExistingRuntime();
    const repositoryRoot = await this.repositoryRoot();
    const operationStartedAt = new Date().toISOString();
    this.startedAt = operationStartedAt;
    this.error = null;
    const projectId = process.env.GETGO_FIREBASE_DEVELOPMENT_PROJECT_ID?.trim();
    const projectNumber = process.env.GETGO_FIREBASE_DEVELOPMENT_PROJECT_NUMBER?.trim();
    const apiKey = process.env.GETGO_FIREBASE_DEVELOPMENT_API_KEY?.trim();
    if (this.config.product === "web" && (!projectId || !projectNumber || !apiKey))
      throw new Error("Development Firebase configuration is incomplete in GetGo Tools .env.");
    this.warmingUp = true;
    const command = this.config.command(target);
    const job: BackgroundJob = {
      id: randomUUID(),
      kind: "deploy",
      deploymentProduct: this.config.product,
      component: "web",
      operation: "run",
      target,
      name: operation === "restart" ? `Restart Localhost ${this.config.product === "web" ? "Web" : "App"}` : `Start Localhost ${this.config.product === "web" ? "Web" : "App"}`,
      description: `Run GetGo ${this.config.product === "web" ? "Web" : "App"} on ${this.config.url}`,
      status: "running",
      completed: 1,
      total: 1,
      progressLabel: "Starting localhost",
      createdAt: operationStartedAt,
      startedAt: operationStartedAt,
      cancellable: false,
      retryable: false,
      logs: [{ timestamp: operationStartedAt, stream: "system", message: `$ npm ${command.join(" ")}` }],
    };
    this.lastJob = job;
    await this.persistLastJob();
    await Promise.all([
      fs.writeFile(this.stdoutFile, "", "utf8"),
      fs.writeFile(this.stderrFile, "", "utf8"),
    ]);
    const stdoutFd = openSync(this.stdoutFile, "a");
    const stderrFd = openSync(this.stderrFile, "a");
    const child = spawn(npmExecutable, command, {
      cwd: repositoryRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        ...(this.config.product === "web" ? {
          VITE_FIREBASE_API_KEY: apiKey!,
          VITE_FIREBASE_PROJECT_ID: projectId!,
          VITE_FIREBASE_MESSAGING_SENDER_ID: projectNumber!,
        } : {}),
      },
      // File descriptors are inherited by the detached process and remain
      // valid after Electron exits. Parent-owned pipes make localhost die when
      // GetGo Tools closes or restarts.
      stdio: ["ignore", stdoutFd, stderrFd],
    });
    closeSync(stdoutFd);
    closeSync(stderrFd);
    this.child = child;
    child.unref();
    if (child.pid)
      await this.persist({ pid: child.pid, startedAt: this.startedAt });
    child.once("error", (cause) => {
      if (this.child !== child) return;
      this.error = cause.message;
      this.child = null;
      job.status = "failed";
      job.error = cause.message;
      job.finishedAt = new Date().toISOString();
      job.logs?.push({ timestamp: job.finishedAt, stream: "system", message: cause.message });
      void this.persistLastJob();
      void this.persist(null);
    });
    child.once("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      void this.persist(null);
      job.status = code === 0 ? "completed" : "failed";
      job.completed = job.total;
      job.finishedAt = new Date().toISOString();
      if (code !== 0) job.error = this.error = `Local ${this.config.product === "web" ? "Web" : "App"} exited with code ${code ?? "unknown"}.`;
      job.logs?.push({ timestamp: job.finishedAt, stream: "system", message: job.error ?? "Localhost stopped." });
      void this.persistLastJob();
    });
    if (!await this.waitUntilOnline(60_000)) {
      const message = this.error ?? `Local ${this.config.product === "web" ? "Web" : "App"} did not become available within 60 seconds.`;
      await this.terminate().catch(() => undefined);
      throw new Error(message);
    }
    if (this.config.warmCommand) try {
      job.progressLabel = "Warming common GetGo routes";
      job.logs?.push({
        timestamp: new Date().toISOString(),
        stream: "system",
        message: "The local server is listening. Precompiling the common GetGo route graphs.",
      });
      await this.persistLastJob();
      const { stdout, stderr } = await execFileAsync(
        "npm",
        this.config.warmCommand,
        {
          cwd: repositoryRoot,
          timeout: 180_000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
      const completedAt = new Date().toISOString();
      for (const message of `${stdout}\n${stderr}`.replace(/\r/g, "").split("\n").filter(Boolean))
        job.logs?.push({ timestamp: completedAt, stream: "system", message });
      job.progressLabel = "Localhost ready";
      job.durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(operationStartedAt));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const completedAt = new Date().toISOString();
      job.logs?.push({
        timestamp: completedAt,
        stream: "system",
        message: `Warmup did not finish, but Vite is available: ${message}`,
      });
      job.progressLabel = "Localhost ready (warmup incomplete)";
      job.durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(operationStartedAt));
    }
    else {
      job.progressLabel = "Localhost ready";
      job.durationMs = Math.max(0, Date.now() - Date.parse(operationStartedAt));
    }
    this.warmingUp = false;
    await this.persistLastJob();
    return this.state();
  }

  private async terminate() {
    const persisted = await this.persistedRuntime();
    const pid = this.child?.pid ?? persisted?.pid;
    if (!pid) return;
    await this.signalRuntime(pid, "SIGTERM");
    this.child = null;
    await this.persist(null);
  }

  restart(target: WebDeploymentTarget = "development") {
    return this.singleFlight(() => this.restartInternal(target));
  }

  private async restartInternal(target: WebDeploymentTarget) {
    // An intentional restart must not inherit the health-check grace period
    // from the process that is being replaced.
    this.lastConfirmedOnlineAt = 0;
    await this.clearExistingRuntime();
    return this.startInternal("restart", target);
  }

}
