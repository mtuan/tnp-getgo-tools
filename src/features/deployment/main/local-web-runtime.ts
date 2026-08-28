import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { BackgroundJob, LocalWebRuntimeSnapshot } from "../../../shared/domain/models.js";

const LOCAL_WEB_URL = "http://localhost:5173";
const LOCAL_WEB_HEALTH_URL = `${LOCAL_WEB_URL}/manifest.json`;
const execFileAsync = promisify(execFile);
interface PersistedRuntime {
  pid: number;
  startedAt: string;
}

export class LocalWebRuntimeManager {
  private child: ChildProcess | null = null;
  private startedAt: string | null = null;
  private error: string | null = null;
  private readonly stateFile: string;
  private readonly jobFile: string;
  private lastJob: BackgroundJob | null = null;
  private lastJobLoaded: Promise<void> | null = null;
  private jobPersistChain: Promise<void> = Promise.resolve();
  private lastConfirmedOnlineAt = 0;

  constructor(
    private readonly toolsAppPath: string,
    userDataPath: string,
  ) {
    this.stateFile = path.join(userDataPath, "local-web-runtime.json");
    this.jobFile = path.join(userDataPath, "local-web-runtime-job.json");
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

  private appendOutput(job: BackgroundJob, stream: "stdout" | "stderr", value: string) {
    const lines = value.replace(/\u001b\[[0-9;]*m/g, "").replace(/\r/g, "").split("\n").map(line => line.trimEnd()).filter(Boolean);
    for (const message of lines) job.logs?.push({ timestamp: new Date().toISOString(), stream, message });
    if ((job.logs?.length ?? 0) > 1000) job.logs = job.logs!.slice(-1000);
    if (lines.at(-1)) job.progressLabel = lines.at(-1)!.slice(-500);
    void this.persistLastJob();
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

  private async isOnline() {
    try {
      const response = await fetch(LOCAL_WEB_HEALTH_URL, {
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
    if (process.platform === "win32") return null;
    try {
      const { stdout } = await execFileAsync("lsof", ["-nP", "-tiTCP:5173", "-sTCP:LISTEN"]);
      const pid = Number(stdout.trim().split(/\s+/)[0]);
      return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }

  async state(): Promise<LocalWebRuntimeSnapshot> {
    await this.ensureLastJobLoaded();
    const online = await this.isOnline();
    const persisted = await this.persistedRuntime();
    const managed = Boolean(this.child || persisted);
    const pid = this.child?.pid ?? persisted?.pid;
    const startedAt = this.startedAt ?? persisted?.startedAt;
    const recentlyOnline = this.lastConfirmedOnlineAt > 0 && Date.now() - this.lastConfirmedOnlineAt < 6_000;
    return {
      status: online || (managed && recentlyOnline) ? "online" : managed ? "starting" : this.error ? "error" : "offline",
      url: LOCAL_WEB_URL,
      managed,
      target: "development",
      pid,
      startedAt,
      error: this.error ?? undefined,
      lastJob: this.lastJob ? structuredClone(this.lastJob) : undefined,
    };
  }

  async start(operation: "start" | "restart" = "start") {
    await this.ensureLastJobLoaded();
    if (this.child) return this.state();
    const persisted = await this.persistedRuntime();
    if (await this.isOnline()) {
      if (persisted) return this.state();
      throw new Error(`Port 5173 is already in use by a process not started by GetGo Tools.`);
    }
    const webRoot = await this.webRoot();
    const operationStartedAt = new Date().toISOString();
    this.startedAt = operationStartedAt;
    this.error = null;
    const projectId = process.env.GETGO_FIREBASE_DEVELOPMENT_PROJECT_ID?.trim();
    const projectNumber = process.env.GETGO_FIREBASE_DEVELOPMENT_PROJECT_NUMBER?.trim();
    const apiKey = process.env.GETGO_FIREBASE_DEVELOPMENT_API_KEY?.trim();
    if (!projectId || !projectNumber || !apiKey)
      throw new Error("Development Firebase configuration is incomplete in GetGo Tools .env.");
    const command = ["run", "dev:getgo:dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"];
    const job: BackgroundJob = {
      id: randomUUID(),
      kind: "deploy",
      component: "web",
      operation: "run",
      target: "development",
      name: operation === "restart" ? "Restart Localhost Web" : "Start Localhost Web",
      description: "Run GetGo Web on http://localhost:5173",
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
    const child = spawn("npm", command, {
      cwd: webRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        VITE_FIREBASE_API_KEY: apiKey,
        VITE_FIREBASE_PROJECT_ID: projectId,
        VITE_FIREBASE_MESSAGING_SENDER_ID: projectNumber,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    child.unref();
    child.stdout?.on("data", chunk => this.appendOutput(job, "stdout", chunk.toString("utf8")));
    child.stderr?.on("data", chunk => this.appendOutput(job, "stderr", chunk.toString("utf8")));
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
      if (code !== 0) job.error = this.error = `Local Web exited with code ${code ?? "unknown"}.`;
      job.logs?.push({ timestamp: job.finishedAt, stream: "system", message: job.error ?? "Localhost stopped." });
      void this.persistLastJob();
    });
    return this.state();
  }

  private async terminate() {
    const persisted = await this.persistedRuntime();
    const pid = this.child?.pid ?? persisted?.pid;
    if (!pid) return;
    if (process.platform === "win32") process.kill(pid, "SIGTERM");
    else process.kill(-pid, "SIGTERM");
    this.child = null;
    await this.persist(null);
  }

  async restart() {
    // An intentional restart must not inherit the health-check grace period
    // from the process that is being replaced.
    this.lastConfirmedOnlineAt = 0;
    const managed = Boolean(this.child || await this.persistedRuntime());
    if (managed) await this.terminate();
    else if (await this.isOnline()) {
      const pid = await this.listenerPid();
      if (!pid) throw new Error("The process using port 5173 could not be identified for restart.");
      process.kill(pid, "SIGTERM");
    }
    for (let attempt = 0; attempt < 15 && await this.isOnline(); attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 200));
    if (await this.isOnline()) throw new Error("The existing localhost server did not stop in time.");
    return this.start("restart");
  }

}
