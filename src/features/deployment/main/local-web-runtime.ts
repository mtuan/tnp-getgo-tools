import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { LocalWebRuntimeSnapshot } from "../../../shared/domain/models.js";

const LOCAL_WEB_URL = "http://localhost:5173";
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

  constructor(
    private readonly toolsAppPath: string,
    userDataPath: string,
  ) {
    this.stateFile = path.join(userDataPath, "local-web-runtime.json");
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
      const response = await fetch(LOCAL_WEB_URL, { signal: AbortSignal.timeout(800) });
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
    const online = await this.isOnline();
    const persisted = await this.persistedRuntime();
    const managed = Boolean(this.child || persisted);
    const pid = this.child?.pid ?? persisted?.pid;
    const startedAt = this.startedAt ?? persisted?.startedAt;
    return {
      status: online ? "online" : managed ? "starting" : this.error ? "error" : "offline",
      url: LOCAL_WEB_URL,
      managed,
      target: "development",
      pid,
      startedAt,
      error: this.error ?? undefined,
    };
  }

  async start() {
    if (this.child) return this.state();
    const persisted = await this.persistedRuntime();
    if (await this.isOnline()) {
      if (persisted) return this.state();
      throw new Error(`Port 5173 is already in use by a process not started by GetGo Tools.`);
    }
    const webRoot = await this.webRoot();
    this.startedAt = new Date().toISOString();
    this.error = null;
    const projectId = process.env.GETGO_FIREBASE_DEVELOPMENT_PROJECT_ID?.trim();
    const projectNumber = process.env.GETGO_FIREBASE_DEVELOPMENT_PROJECT_NUMBER?.trim();
    const apiKey = process.env.GETGO_FIREBASE_DEVELOPMENT_API_KEY?.trim();
    if (!projectId || !projectNumber || !apiKey)
      throw new Error("Development Firebase configuration is incomplete in GetGo Tools .env.");
    const child = spawn("npm", ["run", "dev:getgo:dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
      cwd: webRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        VITE_FIREBASE_API_KEY: apiKey,
        VITE_FIREBASE_PROJECT_ID: projectId,
        VITE_FIREBASE_MESSAGING_SENDER_ID: projectNumber,
      },
      stdio: "ignore",
    });
    this.child = child;
    child.unref();
    if (child.pid)
      await this.persist({ pid: child.pid, startedAt: this.startedAt });
    child.once("error", (cause) => {
      if (this.child !== child) return;
      this.error = cause.message;
      this.child = null;
      void this.persist(null);
    });
    child.once("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      void this.persist(null);
      if (code !== 0) this.error = `Local Web exited with code ${code ?? "unknown"}.`;
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
    return this.start();
  }

}
