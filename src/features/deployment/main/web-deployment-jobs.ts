import type { ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { BackgroundJob, DeploymentComponent, DeploymentComponentState, DeploymentItemState, DeploymentJobReportStep, DeploymentOperation, DeploymentStateSnapshot, WebDeploymentTarget } from "../../../shared/domain/models.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";
import { spawnCommand } from "../../../shared/main/spawn-command.js";
import { FirestoreIndexWaitCancelledError, waitForFirestoreIndexes } from "./firestore-index-readiness.js";
import { parseDeployResult } from "./full-release-jobs.js";

type DeploymentJob = BackgroundJob & {
  kind: "deploy";
  component?: DeploymentComponent;
  target?: WebDeploymentTarget;
  operation?: DeploymentOperation;
};
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
interface BuildRecord { component: DeploymentComponent; target: WebDeploymentTarget; format?: "shared-v1"; builtAt: string; items: DeploymentItemState[] }
interface DeploymentRecord { component: DeploymentComponent; target: WebDeploymentTarget; deployedAt: string; version: string }
interface Runtime { child: ChildProcess; cancelled: boolean; finishing: boolean; phases: Set<string>; outputBuffer: string; reportPhase?: string; deployOutcome?: "deployed" | "up-to-date" | "warning" }

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
  indexes: "Wait for Firestore indexes",
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

  private async hashFunctionCodebase(root: string) {
    const hash = createHash("sha256");
    hash.update(await this.hashDirectory(path.join(root, "src")) ?? "");
    hash.update(await this.hashFile(path.join(root, "package.json")) ?? "");
    hash.update(await this.hashFile(path.join(root, "package-lock.json")) ?? "");
    hash.update(await this.hashDirectory(path.join(root, "vendor")) ?? "");
    return hash.digest("hex");
  }

  private async hashHostingInputs(webRoot: string) {
    const hash = createHash("sha256");
    for (const relativePath of ["src", "public", "plugins", "shared"])
      hash.update(await this.hashDirectory(path.join(webRoot, relativePath)) ?? "");
    for (const relativePath of [
      "index.html", "package.json", "package-lock.json", "tsconfig.app.json", "vite.config.ts",
      "configs/apps/getgo/callables.json",
    ]) hash.update(await this.hashFile(path.join(webRoot, relativePath)) ?? "");
    for (const targetName of ["getgo-dev", "getgo-staging", "getgo"]) {
      hash.update(await this.hashFile(path.join(webRoot, "configs", "deploys", targetName, ".env")) ?? "");
      hash.update(await this.hashFile(path.join(webRoot, "configs", "deploys", targetName, "target.json")) ?? "");
    }
    hash.update(await this.hashDirectory(path.join(webRoot, "node_modules", "@tnp", "getgo-logics")) ?? "");
    try {
      const toolsEnv = Object.fromEntries((await fs.readFile(path.join(webRoot, "..", "tnp-getgo-tools", ".env"), "utf8"))
        .split(/\r?\n/)
        .filter(line => line && !line.trimStart().startsWith("#") && line.includes("="))
        .map(line => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
        }));
      for (const environmentPrefix of ["DEVELOPMENT", "STAGING", "PRODUCTION"])
        for (const suffix of ["API_KEY", "PROJECT_ID", "PROJECT_NUMBER"]) {
          const key = `GETGO_FIREBASE_${environmentPrefix}_${suffix}`;
          hash.update(key);
          hash.update(process.env[key] || toolsEnv[key] || "");
        }
    } catch { hash.update("missing-tools-firebase-config"); }
    return hash.digest("hex");
  }

  private async hashFirebaseInputs(webRoot: string, targetName: string, deployRoot: string, apps: string[]) {
    const hash = createHash("sha256");
    const appsRoot = path.join(webRoot, "configs", "apps");
    hash.update(await this.hashDirectory(path.join(appsRoot, "_shared", "functions")) ?? "");
    for (const app of apps) {
      hash.update(await this.hashDirectory(path.join(appsRoot, app, "functions")) ?? "");
      hash.update(await this.hashFile(path.join(appsRoot, app, "firestore.indexes.json")) ?? "");
    }
    hash.update(await this.hashDirectory(path.join(webRoot, "..", "tnp-getgo-logics", "firebase-rules", "generated")) ?? "");
    const functionsTemplate = path.join(deployRoot, "functions");
    for (const filename of ["package.json", "package-lock.json", "tsconfig.json"])
      hash.update(await this.hashFile(path.join(functionsTemplate, filename)) ?? "");
    hash.update(await this.hashDirectory(path.join(functionsTemplate, "vendor")) ?? "");
    hash.update(await this.hashFile(path.join(webRoot, "configs", "deploys", targetName, "target.json")) ?? "");
    return hash.digest("hex");
  }

  private async localItems(component: DeploymentComponent, webRoot: string, target: WebDeploymentTarget): Promise<DeploymentItemState[]> {
    const targetName = target === "development" ? "getgo-dev" : target === "staging" ? "getgo-staging" : "getgo";
    const targetConfig = JSON.parse(await fs.readFile(path.join(webRoot, "configs", "deploys", targetName, "target.json"), "utf8")) as {
      envFile?: string;
      apps?: string[];
      firebaseConfig?: string;
      resourceDir?: string;
      functionCodebases?: Array<{id: string; name: string}>;
    };
    const deployRoot = path.join(webRoot, targetConfig.resourceDir ?? `configs/deploys/${targetName}`);
    if (component === "web")
      return [
        { id: "web", localHash: await this.hashDirectory(path.join(webRoot, "dist")), deployedHash: null, changed: false },
        { id: "web-inputs", localHash: await this.hashHostingInputs(webRoot), deployedHash: null, changed: false },
        { id: "web-config", localHash: await this.hashFile(path.resolve(webRoot, targetConfig.firebaseConfig ?? path.join(deployRoot, "firebase.json"))), deployedHash: null, changed: false },
      ];
    const ruleItems = await Promise.all([
      ["firestore-rules", "firestore.rules"],
      ["firestore-indexes", "firestore.indexes.json"],
      ["storage-rules", "storage.rules"],
    ].map(async ([id, filename]) => ({ id: id as DeploymentItemState["id"], localHash: await this.hashFile(path.join(deployRoot, filename)), deployedHash: null, changed: false })));
    const functionItems = await Promise.all((targetConfig.functionCodebases ?? []).map(async (codebase) => ({
      id: `functions:${codebase.name}` as const,
      localHash: await this.hashFunctionCodebase(path.join(deployRoot, `functions-${codebase.id}`)),
      deployedHash: null,
      changed: false,
    })));
    return [
      ...ruleItems,
      { id: "firebase-inputs", localHash: await this.hashFirebaseInputs(webRoot, targetName, deployRoot, targetConfig.apps ?? ["getgo"]), deployedHash: null, changed: false },
      ...functionItems,
    ];
  }

  private async recordBuild(component: DeploymentComponent, target: WebDeploymentTarget) {
    const webRoot = await this.webRoot();
    const record: BuildRecord = { component, target, format: "shared-v1", builtAt: new Date().toISOString(), items: await this.localItems(component, webRoot, target) };
    this.builds = [record, ...this.builds.filter((item) => item.component !== component || item.target !== target)].slice(0, 12);
  }

  private componentVersion(component: DeploymentComponent, items: DeploymentItemState[], source: "localHash" | "deployedHash") {
    const values = items
      .filter((item) => component === "web" ? item.id !== "web-inputs" : item.id !== "web" && item.id !== "web-inputs" && item.id !== "web-config" && item.id !== "firebase-inputs")
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
    const targetConfig = JSON.parse(await fs.readFile(path.join(webRoot, "configs", "deploys", targetName, "target.json"), "utf8")) as { firebaseProject: string; functionsRegion?: string; functionCodebases?: Array<{name: string}>; url: string };
    const deployed = JSON.parse(await fs.readFile(path.join(webRoot, "configs", "deploys", targetName, ".deploy-hashes.json"), "utf8").catch(() => "{}")) as Record<string, string>;
    const legacyFirebaseBuild = this.builds.find((item) =>
      item.component === "firebase"
      && item.target === target
      && (!item.items.some((artifact) => artifact.id.startsWith("functions:"))
        || !item.items.some((artifact) => artifact.id === "firebase-inputs")),
    );
    if (legacyFirebaseBuild) {
      legacyFirebaseBuild.items = await this.localItems("firebase", webRoot, target);
      legacyFirebaseBuild.builtAt = new Date().toISOString();
      legacyFirebaseBuild.format = "shared-v1";
      await this.persist();
    }
    const legacyWebBuild = this.builds.find((item) =>
      item.component === "web"
      && item.target === target
      && (!item.items.some((artifact) => artifact.id === "web-inputs")
        || !item.items.some((artifact) => artifact.id === "web-config")),
    );
    if (legacyWebBuild) {
      legacyWebBuild.items = await this.localItems("web", webRoot, target);
      legacyWebBuild.builtAt = new Date().toISOString();
      legacyWebBuild.format = "shared-v1";
      await this.persist();
    }
    const currentItems: Partial<Record<DeploymentComponent, DeploymentItemState[]>> = {
      web: await this.localItems("web", webRoot, target),
      firebase: await this.localItems("firebase", webRoot, target),
    };
    const componentState = (component: DeploymentComponent): DeploymentComponentState => {
      const build = this.builds.find((item) =>
        item.component === component
        && item.target === target
        && item.format === "shared-v1"
        && (component === "web" || item.items.some((artifact) => artifact.id.startsWith("functions:"))),
      );
      const keys = component === "web"
        ? [["web", "hosting"], ["web-inputs", "hosting:inputs"], ["web-config", "hosting:config"]]
        : [
            ["firestore-rules", "firestore:rules"],
            ["firestore-indexes", "firestore:indexes"],
            ["storage-rules", "storage"],
            ["firebase-inputs", "firebase:inputs"],
            ...(targetConfig.functionCodebases ?? []).map(({name}) => [`functions:${name}`, `functions:${name}`]),
          ];
      const items = keys.map(([id, key]) => {
        const localHash = currentItems[component]?.find((item) => item.id === id)?.localHash ?? null;
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
    let child: ChildProcess;
    try {
      child = spawnCommand(npmExecutable, args, {
        cwd: webRoot,
        detached: process.platform !== "win32",
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (cause) {
      job.status = "failed";
      job.error = cause instanceof Error ? cause.message : String(cause);
      job.progressLabel = "Failed";
      job.retryable = true;
      job.cancellable = false;
      job.finishedAt = new Date().toISOString();
      await this.finalizeReport(job, "failed");
      await this.persist();
      throw cause;
    }
    const runtime: Runtime = { child, cancelled: false, finishing: false, phases: new Set(), outputBuffer: "", reportPhase: "startup" };
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
        const deployOutcome = parseDeployResult(line);
        if (deployOutcome) {
          runtime.deployOutcome = deployOutcome;
          continue;
        }
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
    if (this.runtimes.get(job.id) !== runtime || runtime.finishing) return;
    runtime.finishing = true;
    if (!runtime.cancelled) {
      if (!cause && code === 0) {
        try {
          if (job.operation === "deploy" && runtime.deployOutcome !== "up-to-date" && job.component === "firebase" && job.target) {
            const webRoot = await this.webRoot();
            const deploymentState = await this.state(job.target);
            this.beginReportStep(job, runtime, "indexes", "Firebase deployment finished; checking composite index readiness.");
            job.progressLabel = "Checking Firestore indexes";
            job.completed = Math.max(job.completed, job.total - 1);
            await this.persist();
            let lastIndexStatus = "";
            await waitForFirestoreIndexes({
              webRoot,
              firebaseProject: deploymentState.firebaseProject,
              isCancelled: () => runtime.cancelled,
              onStatus: async (status) => {
                const pendingStates = [...new Set(status.pending.map((index) => index.state))].join(", ");
                const detail = `${status.ready}/${status.total} Firestore indexes READY${pendingStates ? `; waiting: ${pendingStates}` : ""}.`;
                job.progressLabel = `Waiting for Firestore indexes · ${status.ready}/${status.total} READY`;
                this.beginReportStep(job, runtime, "indexes", detail === lastIndexStatus ? undefined : detail);
                lastIndexStatus = detail;
                await this.persist();
              },
            });
          }
          if (!runtime.cancelled) {
            job.status = "completed";
            job.completed = job.total;
            job.progressLabel = job.operation === "build" ? "Built" : runtime.deployOutcome === "up-to-date" ? "Up to date" : runtime.deployOutcome === "warning" ? "Completed with warnings" : "Deployed";
            if ((job.operation === "build" || job.operation === "deploy") && job.component && job.target)
              await this.recordBuild(job.component, job.target);
            if (job.operation === "deploy" && runtime.deployOutcome === "deployed" && job.component && job.target)
              await this.recordDeployment(job.component, job.target);
            await this.finalizeReport(job, "completed");
          }
        } catch (waitCause) {
          if (!(waitCause instanceof FirestoreIndexWaitCancelledError) && !runtime.cancelled) {
            job.status = "failed";
            job.error = waitCause instanceof Error ? waitCause.message : String(waitCause);
            job.progressLabel = "Failed";
            job.retryable = true;
            await this.finalizeReport(job, "failed");
          }
        }
      } else {
        job.status = "failed";
        job.error = cause?.message ?? reportedDeploymentError(job) ?? `Deployment exited with code ${code ?? "unknown"}.`;
        job.progressLabel = "Failed";
        job.retryable = true;
        await this.finalizeReport(job, "failed");
      }
    }
    this.runtimes.delete(job.id);
    job.cancellable = false;
    job.finishedAt ??= new Date().toISOString();
    await this.persist();
  }

  private signal(runtime: Runtime, signal: NodeJS.Signals) {
    if (runtime.child.pid === undefined || runtime.child.exitCode !== null) return;
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
    if (!job || !runtime || job.status !== "running" || runtime.child.exitCode !== null) return;
    this.signal(runtime, "SIGSTOP");
    job.status = "paused";
    job.progressLabel = "Paused";
    await this.persist();
  }

  async resume(id: string) {
    await this.ensureLoaded();
    const job = this.jobs.find((item) => item.id === id);
    const runtime = this.runtimes.get(id);
    if (!job || !runtime || job.status !== "paused" || runtime.child.exitCode !== null) return;
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
