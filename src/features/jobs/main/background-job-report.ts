import type { BackgroundJob, DeploymentJobReportStep } from "../../../shared/domain/models.js";
import { createReleaseJobReport } from "../../deployment/main/release-job-report.js";
import { normalizeJobTaskReport } from "./job-task-tracker.js";

const activeStatuses = new Set(["running", "paused"]);

function stepStatus(job: BackgroundJob, index: number): DeploymentJobReportStep["status"] {
  if (index < job.completed) return "completed";
  if (job.status === "completed") return "completed";
  if (index === job.completed && job.status === "failed") return "failed";
  if (index === job.completed && job.status === "cancelled") return "cancelled";
  if (index === job.completed && activeStatuses.has(job.status)) return "running";
  if (["failed", "cancelled"].includes(job.status)) return "skipped";
  return "pending";
}

function phaseSteps(job: BackgroundJob): DeploymentJobReportStep[] {
  const total = Math.max(1, job.total);
  return Array.from({ length: total }, (_, index) => ({
    id: `task-${index + 1}`,
    label: total === 1 ? job.name : `Task ${index + 1}`,
    status: stepStatus(job, index),
    ...(index <= job.completed && job.startedAt ? { startedAt: job.startedAt } : {}),
    ...(index < job.completed && job.finishedAt ? { finishedAt: job.finishedAt } : {}),
    details: index === job.completed && job.error ? [job.error] : [],
  }));
}

function releaseReport(job: BackgroundJob) {
  if (job.component !== "release" || !job.target || job.target === "development") return null;
  const kind = job.operation === "build" ? "build" : job.releaseId ? "archived" : "release";
  return createReleaseJobReport(job.operation === "build" ? "build" : "deploy", job.target, job.startedAt ?? job.createdAt, kind, job.releaseScope);
}

function applyStoredState(job: BackgroundJob) {
  if (!job.report) return;
  job.report.steps.forEach((step, index) => {
    step.status = stepStatus(job, index);
    if (step.status === "running") step.startedAt ??= job.startedAt;
    if (["failed", "cancelled"].includes(step.status) && job.error && !step.details.includes(job.error)) step.details.push(job.error);
  });
  if (["completed", "failed", "cancelled"].includes(job.status)) {
    job.report.finishedAt ??= job.finishedAt;
    job.report.durationMs ??= job.durationMs;
  }
}

export function normalizeBackgroundJobReport(job: BackgroundJob): BackgroundJob {
  if (!job.report) {
    job.report = job.kind === "deploy"
      ? releaseReport(job) ?? {
        operation: job.operation ?? "run", component: job.component ?? job.kind, target: job.target,
        startedAt: job.startedAt ?? job.createdAt, finishedAt: job.finishedAt, durationMs: job.durationMs,
        version: job.version, items: [], steps: phaseSteps(job),
      }
      : {
        operation: job.operation ?? "run", component: job.kind, target: job.target,
        startedAt: job.startedAt ?? job.createdAt, finishedAt: job.finishedAt, durationMs: job.durationMs,
        version: job.version, items: [], steps: [{
          id: "operation", label: job.name, status: stepStatus(job, 0), startedAt: job.startedAt,
          finishedAt: job.finishedAt, durationMs: job.durationMs, completed: job.completed,
          total: Math.max(1, job.total), details: job.error ? [job.error] : [],
        }],
      };
    if (job.kind === "deploy" && job.component === "release") applyStoredState(job);
  }
  if (job.kind === "deploy") {
    job.total = job.report.steps.length;
    job.completed = job.report.steps.filter(step => step.status === "completed").length;
  }
  job.report = normalizeJobTaskReport(job.report, job);
  return job;
}
