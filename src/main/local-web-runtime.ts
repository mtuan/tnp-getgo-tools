import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { LocalWebRuntimeSnapshot } from "../core/models.js";

const LOCAL_WEB_URL = "http://localhost:5173";
export class LocalWebRuntimeManager {
  private child: ChildProcess | null = null;
  private startedAt: string | null = null;
  private error: string | null = null;

  constructor(private readonly toolsAppPath: string) {}

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

  async state(): Promise<LocalWebRuntimeSnapshot> {
    const online = await this.isOnline();
    const managed = Boolean(this.child);
    return {
      status: online ? "online" : managed ? "starting" : this.error ? "error" : "offline",
      url: LOCAL_WEB_URL,
      managed,
      target: "development",
      pid: this.child?.pid,
      startedAt: this.startedAt ?? undefined,
      error: this.error ?? undefined,
    };
  }

  async start() {
    if (this.child) return this.state();
    if (await this.isOnline())
      throw new Error(`Port 5173 is already in use by a process not started by GetGo Tools.`);
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
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child = child;
    let recentError = "";
    child.stdout?.resume();
    child.stderr?.on("data", (chunk: Buffer) => { recentError = `${recentError}${chunk.toString("utf8")}`.slice(-1200); });
    child.once("error", (cause) => {
      if (this.child !== child) return;
      this.error = cause.message;
      this.child = null;
    });
    child.once("close", (code) => {
      if (this.child !== child) return;
      this.child = null;
      if (code !== 0) this.error = recentError.trim().split(/\r?\n/).at(-1) || `Local Web exited with code ${code ?? "unknown"}.`;
    });
    return this.state();
  }

  private terminate() {
    const child = this.child;
    if (!child?.pid) return;
    if (process.platform === "win32") child.kill("SIGTERM");
    else process.kill(-child.pid, "SIGTERM");
    this.child = null;
  }

  async restart() {
    if (!this.child && await this.isOnline())
      throw new Error("The localhost server was not started by GetGo Tools and cannot be restarted here.");
    this.terminate();
    for (let attempt = 0; attempt < 15 && await this.isOnline(); attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 200));
    return this.start();
  }

  dispose() {
    this.terminate();
  }
}
