import type { IpcMain } from "electron";
import type { AiMigrationJobManager } from "../../ai/main/ai-migration-jobs.js";
import type { LocalWebRuntimeManager } from "../../deployment/main/local-web-runtime.js";
import type { PublishJobManager } from "./publish-jobs.js";
import type { WebDeploymentJobManager } from "../../deployment/main/web-deployment-jobs.js";
import type { NativeDeploymentJobManager } from "../../deployment/main/native-deployment-jobs.js";
import type { BackgroundJob } from "../../../shared/domain/models.js";

export function registerBackgroundJobsIpc(
  ipcMain: IpcMain,
  aiMigrationJobs: AiMigrationJobManager,
  publishJobs: PublishJobManager,
  webDeploymentJobs: WebDeploymentJobManager,
  nativeDeploymentJobs: NativeDeploymentJobManager,
  localWebRuntime: LocalWebRuntimeManager,
  appNativeRuntimeJobs: NativeDeploymentJobManager,
  localAppRuntime: LocalWebRuntimeManager,
) {
  const deploymentProduct = (value: unknown) => {
    if (value === undefined || value === "web") return "web" as const;
    if (value === "app") return "app" as const;
    throw new Error("Invalid deployment product.");
  };
  const snapshot = async () => {
    const [migration, published, deployments, nativeDeployments, appNativeJobs] = await Promise.all([
      aiMigrationJobs.list(), publishJobs.list(), webDeploymentJobs.list(), nativeDeploymentJobs.list(), appNativeRuntimeJobs.list(),
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
    const jobs = [...migrated, ...published, ...deployments, ...nativeDeployments, ...appNativeJobs]
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
      appNativeRuntimeJobs.clearFinished(),
    ]);
    return snapshot();
  });
  ipcMain.handle("deployment:start", async (_event, operation: unknown, component: unknown, target: unknown, product: unknown = "web") => {
    if (!(operation === "run" || operation === "build" || operation === "deploy")) throw new Error("Invalid deployment operation.");
    if (!(component === "firebase" || component === "web" || component === "mobile-ios" || component === "mobile-android")) throw new Error("Invalid deployment component.");
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    const requestedProduct = deploymentProduct(product);
    if (component === "mobile-ios" || component === "mobile-android") {
      await (requestedProduct === "app" ? appNativeRuntimeJobs : nativeDeploymentJobs).start(operation, component === "mobile-ios" ? "ios" : "android", target);
    } else if (operation === "run") {
      throw new Error("Simulator runs are only available for native apps.");
    } else {
      await webDeploymentJobs.start(operation, component, target);
    }
    return snapshot();
  });
  ipcMain.handle("deployment:state", (_event, target: unknown) => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    return webDeploymentJobs.state(target);
  });
  const runtime = (product: unknown) => deploymentProduct(product) === "app" ? localAppRuntime : localWebRuntime;
  ipcMain.handle("local-web:state", (_event, product: unknown = "web") => runtime(product).state());
  ipcMain.handle("local-web:start", (_event, product: unknown = "web", target: unknown = "development") => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    return runtime(product).start("start", target);
  });
  ipcMain.handle("local-web:restart", (_event, product: unknown = "web", target: unknown = "development") => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    return runtime(product).restart(target);
  });
  ipcMain.handle("native-project:open", (_event, platform: unknown, target: unknown, product: unknown = "web") => {
    if (!(platform === "ios" || platform === "android")) throw new Error("Invalid native platform.");
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    return (deploymentProduct(product) === "app" ? appNativeRuntimeJobs : nativeDeploymentJobs).open(platform, target);
  });
  for (const action of ["cancel", "pause", "resume", "retry", "delete"] as const)
    ipcMain.handle(`jobs:${action}`, async (_event, jobId: unknown) => {
      if (typeof jobId !== "string") throw new Error("Invalid job ID.");
      await Promise.all([aiMigrationJobs[action](jobId), publishJobs[action](jobId), webDeploymentJobs[action](jobId), nativeDeploymentJobs[action](jobId), appNativeRuntimeJobs[action](jobId)]);
      return snapshot();
    });
  return snapshot;
}
