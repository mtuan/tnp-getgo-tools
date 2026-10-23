import type {
  BackgroundJob,
  DeploymentJobReport,
  DeploymentJobReportStep,
} from "../../../shared/domain/models.js";

export type JobTaskTerminalStatus = "completed" | "failed" | "cancelled" | "skipped";

export function createJobTask(id: string, label: string): DeploymentJobReportStep {
  return { id, label, status: "pending", details: [] };
}

export function startJobTask(task: DeploymentJobReportStep, now = new Date().toISOString()) {
  task.status = "running";
  task.startedAt = now;
  task.finishedAt = undefined;
  task.durationMs = undefined;
}

export function finishJobTask(
  task: DeploymentJobReportStep,
  status: JobTaskTerminalStatus,
  details: string[] = [],
  now = new Date().toISOString(),
) {
  if (status === "skipped" && !task.startedAt) {
    task.status = status;
    task.details = details;
    return;
  }
  task.startedAt ??= now;
  task.finishedAt = now;
  task.durationMs = Math.max(0, Date.parse(now) - Date.parse(task.startedAt));
  task.status = status;
  task.details = details;
}

export function resetInterruptedJobTasks(tasks: DeploymentJobReportStep[]) {
  for (const task of tasks) {
    if (task.status !== "running") continue;
    task.status = "pending";
    delete task.startedAt;
    delete task.finishedAt;
    delete task.durationMs;
  }
}

export function finishPendingJobTasks(tasks: DeploymentJobReportStep[], status: "completed" | "skipped", now = new Date().toISOString()) {
  for (const task of tasks) {
    if (task.status !== "pending") continue;
    finishJobTask(task, status, task.details, now);
  }
}

export function normalizeJobTaskReport(report: DeploymentJobReport, job: BackgroundJob) {
  for (const task of report.steps) {
    if (task.startedAt && task.finishedAt)
      task.durationMs = Math.max(0, Date.parse(task.finishedAt) - Date.parse(task.startedAt));
  }
  report.startedAt ||= job.startedAt ?? job.createdAt;
  report.finishedAt ??= job.finishedAt;
  if (report.finishedAt)
    report.durationMs = Math.max(0, Date.parse(report.finishedAt) - Date.parse(report.startedAt));
  return report;
}
