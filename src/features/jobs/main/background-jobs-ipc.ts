import type { IpcMain } from "electron";
import type { AiMigrationJobManager } from "../../ai/main/ai-migration-jobs.js";
import type { LocalWebRuntimeManager } from "../../deployment/main/local-web-runtime.js";
import type { PublishJobManager } from "./publish-jobs.js";
import type { WebDeploymentJobManager } from "../../deployment/main/web-deployment-jobs.js";
import type { NativeDeploymentJobManager } from "../../deployment/main/native-deployment-jobs.js";
import type { FullReleaseJobManager } from "../../deployment/main/full-release-jobs.js";
import type { BackgroundJob } from "../../../shared/domain/models.js";
import type { AmcImportJobManager } from "../../amc-import/main/amc-import-jobs.js";
import type { SettingsStore } from "../../settings/main/settings.js";

export function registerBackgroundJobsIpc(
  ipcMain: IpcMain,
  aiMigrationJobs: AiMigrationJobManager,
  publishJobs: PublishJobManager,
  webDeploymentJobs: WebDeploymentJobManager,
  nativeDeploymentJobs: NativeDeploymentJobManager,
  fullReleaseJobs: FullReleaseJobManager,
  localWebRuntime: LocalWebRuntimeManager,
  appNativeRuntimeJobs: NativeDeploymentJobManager,
  localAppRuntime: LocalWebRuntimeManager,
  localDesignRuntime: LocalWebRuntimeManager,
  amcImportJobs: AmcImportJobManager,
  settings: SettingsStore,
) {
  const deploymentProduct = (value: unknown) => {
    if (value === undefined || value === "web") return "web" as const;
    if (value === "app") return "app" as const;
    throw new Error("Invalid deployment product.");
  };
  const snapshot = async () => {
    const [migration, published, deployments, nativeDeployments, releases, appNativeJobs, amcImports] = await Promise.all([
      aiMigrationJobs.list(), publishJobs.list(), webDeploymentJobs.list(), nativeDeploymentJobs.list(), fullReleaseJobs.list(), appNativeRuntimeJobs.list(), amcImportJobs.list(),
    ]);
    const migrated = migration.jobs.map((job) => ({
      id: job.id, kind: "ai-migrate" as const,
      name: `AI migrate · ${job.quizTitle}`,
      description: job.errors.at(-1)
        ? `Question ${job.errors.at(-1)?.questionNo}: ${job.errors.at(-1)?.message}`
        : `${job.succeeded} migrated · ${job.failed} failed · ${job.skippedImages + job.skippedVerified} skipped`,
      status: job.status, completed: job.processed, total: job.total,
      progressLabel: job.currentQuestion ? `Question ${job.currentQuestion}` : `${job.processed}/${job.total}`,
      createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt,
      route: `/quizzes/contests/${encodeURIComponent(job.contestId)}/quizzes/${encodeURIComponent(job.quizId)}`,
      cancellable: ["queued", "running", "paused"].includes(job.status),
      retryable: ["failed", "cancelled"].includes(job.status), error: job.errors.at(-1)?.message,
      logs: [
        { timestamp: job.createdAt, stream: "system" as const, message: "AI migration queued." },
        ...(job.startedAt ? [{ timestamp: job.startedAt, stream: "system" as const, message: "AI migration started." }] : []),
        ...job.errors.map(error => ({ timestamp: job.finishedAt ?? job.startedAt ?? job.createdAt, stream: "stderr" as const, message: `Question ${error.questionNo}: ${error.message}` })),
        ...(job.finishedAt ? [{ timestamp: job.finishedAt, stream: "system" as const, message: `AI migration ${job.status}.` }] : []),
      ],
    }));
    const withFallbackLogs = (job: BackgroundJob): BackgroundJob => {
      if (job.logs?.length || job.report?.steps.some(step => step.details.length)) return job;
      return {
        ...job,
        logs: [
          { timestamp: job.createdAt, stream: "system", message: `${job.name} queued.` },
          ...(job.error ? [{ timestamp: job.finishedAt ?? job.startedAt ?? job.createdAt, stream: "stderr" as const, message: job.error }] : []),
          ...(job.finishedAt ? [{ timestamp: job.finishedAt, stream: "system" as const, message: `Job ${job.status}.` }] : []),
        ],
      };
    };
    const jobs = [...migrated, ...published, ...deployments, ...nativeDeployments, ...releases, ...appNativeJobs, ...amcImports]
      .map(withFallbackLogs)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { aiConcurrency: migration.concurrency, jobs };
  };
  ipcMain.handle("jobs:list", snapshot);
  ipcMain.handle("jobs:clear-finished", async () => {
    await Promise.all([
      aiMigrationJobs.clearFinished(),
      publishJobs.clearFinished(),
      webDeploymentJobs.clearFinished(),
      nativeDeploymentJobs.clearFinished(),
      fullReleaseJobs.clearFinished(),
      appNativeRuntimeJobs.clearFinished(),
      amcImportJobs.clearFinished(),
    ]);
    return snapshot();
  });
  ipcMain.handle("deployment:start", async (_event, operation: unknown, component: unknown, target: unknown, product: unknown = "web") => {
    if (!(operation === "run" || operation === "run-device" || operation === "build" || operation === "deploy")) throw new Error("Invalid deployment operation.");
    if (!(component === "firebase" || component === "web" || component === "mobile-ios" || component === "mobile-android")) throw new Error("Invalid deployment component.");
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    const requestedProduct = deploymentProduct(product);
    if ((await fullReleaseJobs.list()).some(job => ["queued", "running", "paused"].includes(job.status))) {
      throw new Error("Wait for the active full release to finish before starting another deployment.");
    }
    if (component === "mobile-ios" || component === "mobile-android") {
      if (operation === "run-device" && requestedProduct !== "web") throw new Error("Connected-device runs are only available for GetGo Web native apps.");
      await (requestedProduct === "app" ? appNativeRuntimeJobs : nativeDeploymentJobs).start(operation, component === "mobile-ios" ? "ios" : "android", target);
    } else if (operation === "run" || operation === "run-device") {
      throw new Error("Simulator runs are only available for native apps.");
    } else {
      await webDeploymentJobs.start(operation, component, target);
    }
    return snapshot();
  });
  ipcMain.handle("deployment:state", async (_event, target: unknown) => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    const [state, iosSigning, nativeVersion] = await Promise.all([
      webDeploymentJobs.state(target),
      nativeDeploymentJobs.iosSigningState(target),
      nativeDeploymentJobs.versionState(),
    ]);
    return { ...state, iosSigning, nativeVersion };
  });
  ipcMain.handle("release:doctor", async (_event, target: unknown) => {
    if (!(target === "staging" || target === "production")) throw new Error("Full releases are available only for staging and production.");
    return fullReleaseJobs.doctor(target);
  });
  ipcMain.handle("release:start", async (_event, target: unknown, scope: unknown) => {
    if (!(target === "staging" || target === "production")) throw new Error("Full releases are available only for staging and production.");
    if (!(scope === "all" || scope === "web" || scope === "ios" || scope === "android")) throw new Error("Invalid release scope.");
    const componentJobs = [...await webDeploymentJobs.list(), ...await nativeDeploymentJobs.list()];
    if (componentJobs.some(job => ["queued", "running", "paused"].includes(job.status))) {
      throw new Error("Wait for active component deployments to finish before starting the full release.");
    }
    await fullReleaseJobs.start(target, scope);
    return snapshot();
  });
  ipcMain.handle("native-version:update", async (_event, increment: unknown) => {
    if (!(increment === "patch" || increment === "minor" || increment === "major")) throw new Error("Invalid native version increment.");
    return nativeDeploymentJobs.updateVersion(increment);
  });
  const runtime = (value: unknown) => {
    if (value === "design") return localDesignRuntime;
    return deploymentProduct(value) === "app" ? localAppRuntime : localWebRuntime;
  };
  ipcMain.handle("local-web:state", (_event, runtimeId: unknown = "web") => runtime(runtimeId).state());
  ipcMain.handle("local-web:start", async (_event, runtimeId: unknown = "web", target: unknown = "development", protocol: unknown = "https") => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    if (!(protocol === "http" || protocol === "https")) throw new Error("Invalid local web protocol.");
    const result = await runtime(runtimeId).start("start", target, protocol);
    if (runtimeId === undefined || runtimeId === "web") await settings.update({ localWebProtocol: protocol });
    return result;
  });
  ipcMain.handle("local-web:restart", async (_event, runtimeId: unknown = "web", target: unknown = "development", protocol: unknown = "https") => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    if (!(protocol === "http" || protocol === "https")) throw new Error("Invalid local web protocol.");
    const result = await runtime(runtimeId).restart(target, protocol);
    if (runtimeId === undefined || runtimeId === "web") await settings.update({ localWebProtocol: protocol });
    return result;
  });
  ipcMain.handle("local-web:stop", (_event, runtimeId: unknown = "web") => runtime(runtimeId).stop());
  ipcMain.handle("native-project:open", (_event, platform: unknown, target: unknown, product: unknown = "web") => {
    if (!(platform === "ios" || platform === "android")) throw new Error("Invalid native platform.");
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    return (deploymentProduct(product) === "app" ? appNativeRuntimeJobs : nativeDeploymentJobs).open(platform, target);
  });
  for (const action of ["cancel", "pause", "resume", "retry", "delete"] as const)
    ipcMain.handle(`jobs:${action}`, async (_event, jobId: unknown) => {
      if (typeof jobId !== "string") throw new Error("Invalid job ID.");
      await Promise.all([aiMigrationJobs[action](jobId), publishJobs[action](jobId), webDeploymentJobs[action](jobId), nativeDeploymentJobs[action](jobId), fullReleaseJobs[action](jobId), appNativeRuntimeJobs[action](jobId), amcImportJobs[action](jobId)]);
      return snapshot();
    });
  return snapshot;
}
