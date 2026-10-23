import type {
  AiMigrationJob,
  DeploymentJobReport,
  DeploymentJobReportStep,
} from "../../../shared/domain/models.js";
import { createJobTask } from "../../jobs/main/job-task-tracker.js";

export function storedAiQuestionTasks(job: AiMigrationJob): DeploymentJobReportStep[] {
  const tasks = job.context.jobTasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((task): task is DeploymentJobReportStep => Boolean(
    task && typeof task === "object" && typeof task.id === "string"
      && typeof task.label === "string" && typeof task.status === "string"
      && Array.isArray(task.details),
  ));
}

export function ensureAiQuestionTasks(job: AiMigrationJob): DeploymentJobReportStep[] {
  const stored = storedAiQuestionTasks(job);
  if (stored.length) return stored;
  const tasks = questionNumbers(job).map((questionNo, index) => ({
    ...createJobTask(`question-${questionNo}`, `Question ${questionNo}`),
    status: questionStatus(job, questionNo, index),
    details: job.errors.filter(error => error.questionNo === questionNo).map(error => error.message),
  }));
  job.context.jobTasks = tasks;
  return tasks;
}

function questionNumbers(job: AiMigrationJob): string[] {
  const stored = job.context.questionNumbers;
  if (Array.isArray(stored) && stored.every(value => typeof value === "string" || typeof value === "number"))
    return stored.map(String);
  return Array.from({ length: job.total }, (_, index) => String(index + 1));
}

function questionStatus(job: AiMigrationJob, questionNo: string, index: number): DeploymentJobReportStep["status"] {
  if (job.errors.some(error => error.questionNo === questionNo)) return "failed";
  if (index < job.processed) return "completed";
  if (job.currentQuestion === questionNo && job.status === "running") return "running";
  if (job.currentQuestion === questionNo && job.status === "cancelled") return "cancelled";
  if (["failed", "cancelled", "completed"].includes(job.status)) return "skipped";
  return "pending";
}

export function createAiQuestionJobReport(job: AiMigrationJob): DeploymentJobReport {
  const storedTasks = ensureAiQuestionTasks(job);
  return {
    operation: "run",
    component: "ai-migrate",
    startedAt: job.startedAt ?? job.createdAt,
    finishedAt: job.finishedAt,
    items: [],
    steps: storedTasks,
  };
}
