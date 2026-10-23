import type { BackgroundJob, DeploymentJobReport, DeploymentJobReportStep, ReleaseScope, WebDeploymentTarget } from "../../../shared/domain/models.js";
import { createJobTask, finishJobTask, finishPendingJobTasks, startJobTask } from "../../jobs/main/job-task-tracker.js";

type ReleaseTarget = Exclude<WebDeploymentTarget, "development">;
type StepDefinition = { id: string; label: string };

export const archivedWebDeploymentSteps = 8;

const archivedDefinitions: StepDefinition[] = [
  { id: "verify", label: "Verify release and deployment readiness" },
  { id: "extract", label: "Extract release artifact" },
  { id: "configuration", label: "Verify environment configuration" },
  { id: "plan", label: "Prepare deployment plan" },
  { id: "dependencies", label: "Install Function dependencies" },
  { id: "deploy", label: "Deploy Web and Firebase resources" },
  { id: "record", label: "Record release deployment" },
  { id: "history", label: "Synchronize release history" },
];

const buildDefinitions: StepDefinition[] = [
  { id: "prerequisites", label: "Check cloud prerequisites" },
  { id: "checks", label: "Run application code checks" },
  { id: "web", label: "Build Web artifact" },
  { id: "plan", label: "Prepare Firebase build plan" },
  { id: "functions", label: "Build Function artifacts" },
  { id: "build-complete", label: "Complete application build checks" },
  { id: "payload", label: "Assemble Web and Firebase payload" },
  { id: "environment", label: "Package environment configurations" },
  { id: "inputs", label: "Finalize release inputs" },
  { id: "archive", label: "Create and verify immutable archive" },
  { id: "commit", label: "Commit and tag release" },
  { id: "push", label: "Push release archive" },
];

const webReleaseDefinitions: StepDefinition[] = [
  { id: "cloud", label: "Check cloud prerequisites" },
  { id: "checks", label: "Run code and compatibility checks" },
  { id: "web", label: "Build Web artifact" },
  { id: "plan", label: "Prepare deployment plan" },
  { id: "artifacts", label: "Build deployment artifacts" },
  { id: "firebase", label: "Deploy Firebase resources" },
  { id: "complete", label: "Complete Web and Firebase deployment" },
];

function pendingSteps(definitions: StepDefinition[]): DeploymentJobReportStep[] {
  return definitions.map(step => createJobTask(step.id, step.label));
}

export function createReleaseJobReport(
  operation: "build" | "deploy",
  target: ReleaseTarget,
  startedAt: string,
  kind: "build" | "archived" | "release",
  scope: ReleaseScope = "web",
): DeploymentJobReport {
  const definitions = kind === "build" ? buildDefinitions
    : kind === "archived" ? archivedDefinitions
      : [
        ...webReleaseDefinitions,
        ...(scope === "ios" || scope === "all" ? [{ id: "ios", label: "Upload iOS to TestFlight" }] : []),
        ...(scope === "android" || scope === "all" ? [{ id: "android", label: target === "staging" ? "Upload Android to Internal testing" : "Create Android production draft" }] : []),
      ];
  return { operation, component: "release", target, startedAt, items: [], steps: pendingSteps(definitions) };
}

export function advanceReleaseJobReport(job: BackgroundJob, completed: number, detail: string) {
  if (!job.report) return;
  const now = new Date().toISOString();
  const bounded = Math.max(0, Math.min(job.report.steps.length, completed));
  job.report.steps.forEach((step, index) => {
    if (index < bounded) {
      if (step.status !== "completed") {
        step.startedAt ??= index === 0 ? job.report!.startedAt : now;
        finishJobTask(step, "completed", step.details, now);
      }
    } else if (index === bounded && bounded < job.report!.steps.length) {
      if (step.status !== "running") startJobTask(step, now);
      if (detail && !step.details.includes(detail)) step.details.push(detail);
    }
  });
}

export function finishReleaseJobReport(job: BackgroundJob, status: "completed" | "failed" | "cancelled") {
  if (!job.report) return;
  const now = job.finishedAt ?? new Date().toISOString();
  const active = job.report.steps.find(step => step.status === "running")
    ?? (status !== "completed" ? job.report.steps.find(step => step.status === "pending") : undefined);
  if (active) {
    active.startedAt ??= job.startedAt ?? job.report.startedAt;
    const details = job.error && !active.details.includes(job.error) ? [...active.details, job.error] : active.details;
    finishJobTask(active, status, details, now);
  }
  if (status === "completed") {
    finishPendingJobTasks(job.report.steps, "completed", now);
  } else {
    finishPendingJobTasks(job.report.steps, "skipped", now);
  }
  job.report.finishedAt = now;
  job.report.durationMs = Math.max(0, Date.parse(now) - Date.parse(job.report.startedAt));
}
