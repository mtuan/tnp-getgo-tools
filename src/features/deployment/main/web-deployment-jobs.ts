import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackgroundJob, DeploymentComponent, DeploymentComponentState, DeploymentItemState, DeploymentJobReportStep, DeploymentOperation, DeploymentStateSnapshot, WebDeploymentTarget } from "../../../shared/domain/models.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";

type DeploymentJob = BackgroundJob & {
  kind: "deploy";
  component?: DeploymentComponent;
  target?: WebDeploymentTarget;
  operation?: DeploymentOperation;
};
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
interface BuildRecord { component: DeploymentComponent; target: WebDeploymentTarget; format?: "shared-v1"; builtAt: string; items: DeploymentItemState[] }
interface DeploymentRecord { component: DeploymentComponent; target: WebDeploymentTarget; deployedAt: string; version: string }
interface Runtime { child: ChildProcess; cancelled: boolean; phases: Set<string>; outputBuffer: string; reportPhase?: string }

const targetScripts: Record<WebDeploymentTarget, string> = {
  development: "deploy:getgo:dev",
  staging: "deploy:getgo:staging",
  production: "deploy:getgo:production",
};

function cleanLine(value: string) {
  return value.replace(/\u001b\[[0-9;]*m/g, "").trim().slice(-2000);
}

function reportedDeploymentError(job: DeploymentJob) {
  const details = job.report?.steps.flatMap((step) => step.details) ?? [];
  return [...details].reverse().find((line) =>
    line.startsWith("Error:")
    && !line.startsWith("Error: Command failed with exit code"),
  );
}

function progressTotal(operation: DeploymentOperation, component: DeploymentComponent) {
  if (operation === "build") return component === "firebase" ? 6 : 4;
  return component === "firebase" ? 8 : 6;
}

function outputPhase(line: string, component: DeploymentComponent) {
  if (line.includes("Generating shared editor types") || line.includes("Generating canonical Firebase rules") || line.includes("Checking and building @tnp/getgo-logics")) return "dependencies";
  if (component === "firebase" && line.includes("Synced firestore.rules")) return "firestore";
  if (component === "firebase" && line.includes("Synced storage.rules")) return "storage";
  if (component === "firebase" && (line.includes("Assembled functions/src") || line.includes("Building functions"))) return "functions";
  if (component === "web" && (line.includes("Building…") || /vite v\d/i.test(line))) return "build";
  if (component === "web" && /built in \d/i.test(line)) return "bundle";
  if (line.includes("Resources to deploy:") || line.includes("Resources (would be deployed):")) return "plan";
  if (line.includes("Deploying:")) return "deploy";
  return null;
}

const phaseLabels: Record<string, string> = {
  startup: "Initialize job",
  dependencies: "Prepare shared dependencies",
  firestore: "Generate Firestore rules and indexes",
  storage: "Generate Cloud Storage rules",
  functions: "Build Cloud Functions",
  build: "Compile Web application",
  bundle: "Finalize Web bundle",
  plan: "Compare deployment artifacts",
  deploy: "Publish to Firebase",
  complete: "Finalize report",
};

export class WebDeploymentJobManager {
  private jobs: DeploymentJob[] = [];
  private loadPromise: Promise<void> | null = null;
  private persistChain: Promise<void> = Promise.resolve();
  private runtimes = new Map<string, Runtime>();
  private builds: BuildRecord[] = [];
  private deployments: DeploymentRecord[] = [];

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
      const stored = JSON.parse(await fs.readFile(this.filePath, "utf8")) as { jobs?: DeploymentJob[]; builds?: BuildRecord[]; deployments?: DeploymentRecord[] };
      const migrateComponent = (component: DeploymentComponent | "firebase-rules" | undefined) => component === "firebase-rules" ? "firebase" : component;
      this.builds = (stored.builds ?? []).map((item) => ({ ...item, component: migrateComponent(item.component) as DeploymentComponent }));
      this.deployments = (stored.deployments ?? []).map((item) => ({ ...item, component: migrateComponent(item.component) as DeploymentComponent }));
      this.jobs = (stored.jobs ?? []).slice(0, 50).map((storedJob) => {
        const job = { ...storedJob, component: migrateComponent(storedJob.component) } as DeploymentJob;
        if (["queued", "running", "paused"].includes(job.status)) {
          job.status = "failed";
          job.cancellable = false;
          job.retryable = Boolean(job.component && job.target);
          job.finishedAt = new Date().toISOString();
          job.error = "Deployment was interrupted when GetGo Tools stopped.";
        }
        if (job.status === "failed" && /^Deployment exited with code/.test(job.error ?? ""))
          job.error = reportedDeploymentError(job) ?? job.error;
        if (job.report && !job.report.finishedAt && ["failed", "cancelled"].includes(job.status)) {
          const finishedAt = job.finishedAt ?? new Date().toISOString();
          const lastStep = job.report.steps.at(-1);
          if (lastStep && !lastStep.finishedAt) {
            lastStep.status = job.status === "cancelled" ? "cancelled" : "failed";
            lastStep.finishedAt = finishedAt;
            lastStep.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(lastStep.startedAt));
          }
          job.report.finishedAt = finishedAt;
          job.report.durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(job.report.startedAt));
          job.report.steps.push({ id: "complete", label: phaseLabels.complete, status: job.status === "cancelled" ? "cancelled" : "failed", startedAt: finishedAt, finishedAt, durationMs: 0, details: job.error ? [job.error] : [] });
        }
        return job;
      });
    } catch {
      this.jobs = [];
      this.builds = [];
      this.deployments = [];
    }
    await this.persist();
  }

  private async persist() {
    const contents = JSON.stringify({ jobs: this.jobs.slice(0, 50), builds: this.builds, deployments: this.deployments }, null, 2);
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
    const root = await findRelatedRepository(this.toolsAppPath, {
      packageName: "tnp-getgo-web",
      directoryName: "tnp-getgo-web",
      environmentVariable: "GETGO_WEB_ROOT",
    });
    if (root) return root;
    throw new Error("GetGo Web repository was not found. Set GETGO_WEB_ROOT to its absolute path.");
  }

  private async hashFile(filePath: string) {
    try { return createHash("sha256").update(await fs.readFile(filePath)).digest("hex"); }
    catch { return null; }
  }

  private async hashDirectory(root: string) {
    const hash = createHash("sha256");
    const walk = async (directory: string) => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(full);
        else { hash.update(full.slice(root.length)); hash.update(await fs.readFile(full)); }
      }
    };
    try { await walk(root); return hash.digest("hex"); }
    catch { return null; }
  }

  private async localItems(component: DeploymentComponent, webRoot: string): Promise<DeploymentItemState[]> {
    const deployRoot = path.join(webRoot, "configs", "deploys", "getgo");
    if (component === "web")
      return [{ id: "web", localHash: await this.hashDirectory(path.join(webRoot, "dist")), deployedHash: null, changed: false }];
    const ruleItems = await Promise.all([
      ["firestore-rules", "firestore.rules"],
      ["firestore-indexes", "firestore.indexes.json"],
      ["storage-rules", "storage.rules"],
    ].map(async ([id, filename]) => ({ id: id as DeploymentItemState["id"], localHash: await this.hashFile(path.join(deployRoot, filename)), deployedHash: null, changed: false })));
    return [...ruleItems, { id: "functions", localHash: await this.hashDirectory(path.join(deployRoot, "functions", "src")), deployedHash: null, changed: false }];
  }

  private async recordBuild(component: DeploymentComponent, target: WebDeploymentTarget) {
    const webRoot = await this.webRoot();
    const record: BuildRecord = { component, target, format: "shared-v1", builtAt: new Date().toISOString(), items: await this.localItems(component, webRoot) };
    this.builds = [record, ...this.builds.filter((item) => item.component !== component)].slice(0, 12);
  }

  private componentVersion(component: DeploymentComponent, items: DeploymentItemState[], source: "localHash" | "deployedHash") {
    const values = items
      .filter((item) => component === "web" ? item.id === "web" : item.id !== "web")
      .map((item) => `${item.id}:${item[source] ?? ""}`)
      .sort();
    if (!values.length || values.some((value) => value.endsWith(":"))) return undefined;
    return `${component === "web" ? "web" : "firebase"}-${createHash("sha256").update(values.join("\n")).digest("hex").slice(0, 12)}`;
  }

  private async recordDeployment(component: DeploymentComponent, target: WebDeploymentTarget) {
    const state = await this.state(target);
    const version = (component === "web" ? state.web : state.rules).deployedVersion;
    if (!version) return;
    const record: DeploymentRecord = { component, target, deployedAt: new Date().toISOString(), version };
    this.deployments = [record, ...this.deployments.filter((item) => item.component !== component || item.target !== target)].slice(0, 12);
  }

  private closeReportStep(job: DeploymentJob, status: DeploymentJobReportStep["status"] = "completed") {
    const step = job.report?.steps.at(-1);
    if (!step || step.finishedAt) return;
    step.finishedAt = new Date().toISOString();
    step.durationMs = Math.max(0, Date.parse(step.finishedAt) - Date.parse(step.startedAt));
    step.status = status;
  }

  private beginReportStep(job: DeploymentJob, runtime: Runtime, id: string, detail?: string) {
    if (!job.report) return;
    if (runtime.reportPhase !== id) {
      this.closeReportStep(job);
      runtime.reportPhase = id;
      job.report.steps.push({ id, label: phaseLabels[id] ?? id, status: "completed", startedAt: new Date().toISOString(), details: [] });
    }
    if (detail) {
      const step = job.report.steps.at(-1)!;
      step.details.push(detail);
      if (step.details.length > 200) step.details.shift();
    }
  }

  private async finalizeReport(job: DeploymentJob, status: DeploymentJobReportStep["status"]) {
    if (!job.report || !job.component || !job.target) return;
    this.closeReportStep(job, status);
    const now = new Date().toISOString();
    job.report.steps.push({ id: "complete", label: phaseLabels.complete, status, startedAt: now, finishedAt: now, durationMs: 0, details: job.error ? [job.error] : [] });
    job.report.finishedAt = now;
    job.report.durationMs = Math.max(0, Date.parse(now) - Date.parse(job.report.startedAt));
    try {
      const state = await this.state(job.target);
      const componentState = job.component === "web" ? state.web : state.rules;
      job.report.version = job.operation === "build" ? componentState.buildVersion : componentState.deployedVersion;
      job.report.items = componentState.items;
    } catch (cause) {
      job.report.steps.at(-1)!.details.push(`Could not collect artifact metadata: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }

  async state(target: WebDeploymentTarget): Promise<DeploymentStateSnapshot> {
    await this.ensureLoaded();
    const webRoot = await this.webRoot();
    const targetName = target === "development" ? "getgo-dev" : target === "staging" ? "getgo-staging" : "getgo";
    const targetConfig = JSON.parse(await fs.readFile(path.join(webRoot, "configs", "deploys", targetName, "target.json"), "utf8")) as { firebaseProject: string; functionsRegion?: string; url: string };
    const deployed = JSON.parse(await fs.readFile(path.join(webRoot, "configs", "deploys", targetName, ".deploy-hashes.json"), "utf8").catch(() => "{}")) as Record<string, string>;
    const componentState = (component: DeploymentComponent): DeploymentComponentState => {
      const build = this.builds.find((item) =>
        item.component === component
        && item.format === "shared-v1"
        && (component === "web" || item.items.some((artifact) => artifact.id === "functions")),
      );
      const keys = component === "web"
        ? [["web", "hosting"]]
        : [["firestore-rules", "firestore:rules"], ["firestore-indexes", "firestore:indexes"], ["storage-rules", "storage"], ["functions", "functions"]];
      const items = keys.map(([id, key]) => {
        const localHash = build?.items.find((item) => item.id === id)?.localHash ?? null;
        const deployedHash = deployed[key] ?? null;
        return { id: id as DeploymentItemState["id"], localHash, deployedHash, changed: Boolean(localHash && localHash !== deployedHash) };
      });
      const status = !build ? "build-required" : items.every((item) => !item.deployedHash) ? "not-deployed" : items.some((item) => item.changed) ? "changed" : "up-to-date";
      const deployment = this.deployments.find((item) => item.component === component && item.target === target);
      const completedDeployment = this.jobs.find((item) => item.component === component && item.target === target && item.operation === "deploy" && item.status === "completed");
      const buildVersion = build ? this.componentVersion(component, items, "localHash") : undefined;
      const deployedVersion = this.componentVersion(component, items, "deployedHash");
      return { component, status, builtAt: build?.builtAt, buildVersion, deployedAt: deployment && deployment.version === deployedVersion ? deployment.deployedAt : completedDeployment?.finishedAt, deployedVersion, items };
    };
    return {
      target,
      firebaseProject: targetConfig.firebaseProject,
      functionsRegion: targetConfig.functionsRegion ?? "us-central1",
      firebaseConsoleUrl: `https://console.firebase.google.com/project/${encodeURIComponent(targetConfig.firebaseProject)}/overview`,
      webUrl: targetConfig.url,
      rules: componentState("firebase"),
      web: componentState("web"),
    };
  }

  async start(operation: DeploymentOperation, component: DeploymentComponent, target: WebDeploymentTarget) {
    await this.ensureLoaded();
    const activeJobs = this.jobs.filter((job) => ["queued", "running", "paused"].includes(job.status));
    if (activeJobs.some((job) => job.component === component))
      throw new Error(`Another ${component === "web" ? "Web" : "Firebase"} job is already active.`);
    if (operation === "deploy" && activeJobs.some((job) => job.operation === "deploy"))
      throw new Error("Another deployment is already active.");
    const webRoot = await this.webRoot();
    const job: DeploymentJob = {
      id: randomUUID(),
      kind: "deploy",
      component,
      target,
      operation,
      name: operation === "build"
        ? `Build ${component === "web" ? "Web" : "Firebase"}`
        : `Build & deploy ${component === "web" ? "Web" : "Firebase"} · ${target}`,
      description: operation === "build"
        ? `Prepare local ${component === "web" ? "GetGo Web" : "Firebase rules, indexes, and Cloud Functions"} deployment files`
        : `Build and publish ${component === "web" ? "GetGo Web" : "changed Firebase rules, indexes, or Cloud Functions"} to ${target}`,
      status: "queued",
      completed: 0,
      total: progressTotal(operation, component),
      progressLabel: "Starting deployment",
      createdAt: new Date().toISOString(),
      cancellable: true,
      retryable: false,
      report: {
        operation,
        component,
        target,
        startedAt: new Date().toISOString(),
        items: [],
        steps: [{ id: "startup", label: phaseLabels.startup, status: "completed", startedAt: new Date().toISOString(), details: ["Deployment process queued."] }],
      },
    };
    this.jobs.unshift(job);
    await this.persist();

    const scope = component === "web" ? "web" : "firebase";
    const args = ["run", targetScripts[target], "--", `--scope=${scope}`];
    if (operation === "build") args.push("--build-only", "--no-lint", "--no-typecheck");
    else args.push("--no-lint", "--no-typecheck");
    const child = spawn(npmExecutable, args, {
      cwd: webRoot,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const runtime: Runtime = { child, cancelled: false, phases: new Set(), outputBuffer: "", reportPhase: "startup" };
    this.runtimes.set(job.id, runtime);
    job.status = "running";
    job.startedAt = new Date().toISOString();
    job.progressLabel = "Building and deploying";
    await this.persist();

    const updateOutput = (chunk: Buffer) => {
      runtime.outputBuffer += chunk.toString("utf8");
      const lines = runtime.outputBuffer.split(/\r?\n/);
      runtime.outputBuffer = lines.pop() ?? "";
      for (const raw of lines) {
        const line = cleanLine(raw);
        if (!line || runtime.cancelled) continue;
        job.progressLabel = line;
        const phase = outputPhase(line, component);
        this.beginReportStep(job, runtime, phase ?? runtime.reportPhase ?? "startup", line);
        if (phase && !runtime.phases.has(phase)) {
          runtime.phases.add(phase);
          job.completed = Math.min(job.total - 1, runtime.phases.size);
        }
      }
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
        job.completed = job.total;
        job.progressLabel = job.operation === "build" ? "Built" : "Deployed";
        if ((job.operation === "build" || job.operation === "deploy") && job.component && job.target)
          await this.recordBuild(job.component, job.target);
        if (job.operation === "deploy" && job.component && job.target)
          await this.recordDeployment(job.component, job.target);
        await this.finalizeReport(job, "completed");
      } else {
        job.status = "failed";
        job.error = cause?.message ?? reportedDeploymentError(job) ?? `Deployment exited with code ${code ?? "unknown"}.`;
        job.progressLabel = "Failed";
        job.retryable = true;
        await this.finalizeReport(job, "failed");
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
    await this.finalizeReport(job, "cancelled");
    await this.persist();
  }

  async retry(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    if (!job?.retryable || !job.component || !job.target) return;
    await this.start(job.operation ?? "deploy", job.component, job.target);
  }

  async delete(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    if (!job || ["queued", "running", "paused"].includes(job.status)) return;
    this.jobs = this.jobs.filter((item) => item.id !== id);
    await this.persist();
  }


  async clearFinished() {
    await this.ensureLoaded();
    this.jobs = this.jobs.filter((job) => ["queued", "running", "paused"].includes(job.status));
    await this.persist();
  }
}
