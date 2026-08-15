import type { IpcMain } from "electron";
import type { AiMigrationJobManager } from "../../ai/main/ai-migration-jobs.js";
import type { LocalWebRuntimeManager } from "../../deployment/main/local-web-runtime.js";
import type { PublishJobManager } from "./publish-jobs.js";
import type { WebDeploymentJobManager } from "../../deployment/main/web-deployment-jobs.js";

export function registerBackgroundJobsIpc(
  ipcMain: IpcMain,
  aiMigrationJobs: AiMigrationJobManager,
  publishJobs: PublishJobManager,
  webDeploymentJobs: WebDeploymentJobManager,
  localWebRuntime: LocalWebRuntimeManager,
) {
  const snapshot = async () => {
    const [migration, published, deployments] = await Promise.all([
      aiMigrationJobs.list(), publishJobs.list(), webDeploymentJobs.list(),
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
    }));
    return { aiConcurrency: migration.concurrency, jobs: [...migrated, ...published, ...deployments].sort((left, right) => right.createdAt.localeCompare(left.createdAt)) };
  };
  ipcMain.handle("jobs:list", snapshot);
  ipcMain.handle("deployment:start", async (_event, operation: unknown, component: unknown, target: unknown) => {
    if (!(operation === "build" || operation === "deploy")) throw new Error("Invalid deployment operation.");
    if (!(component === "firebase" || component === "web")) throw new Error("Invalid deployment component.");
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    await webDeploymentJobs.start(operation, component, target);
    return snapshot();
  });
  ipcMain.handle("deployment:state", (_event, target: unknown) => {
    if (!(target === "development" || target === "staging" || target === "production")) throw new Error("Invalid deployment target.");
    return webDeploymentJobs.state(target);
  });
  ipcMain.handle("local-web:state", () => localWebRuntime.state());
  ipcMain.handle("local-web:start", () => localWebRuntime.start());
  ipcMain.handle("local-web:restart", () => localWebRuntime.restart());
  for (const action of ["cancel", "pause", "resume", "retry", "delete"] as const)
    ipcMain.handle(`jobs:${action}`, async (_event, jobId: unknown) => {
      if (typeof jobId !== "string") throw new Error("Invalid job ID.");
      await Promise.all([aiMigrationJobs[action](jobId), publishJobs[action](jobId), webDeploymentJobs[action](jobId)]);
      return snapshot();
    });
  return snapshot;
}
