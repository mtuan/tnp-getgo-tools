import type { BackgroundJob, DeploymentJobReport, DeploymentJobReportStep, ReleaseScope, WebDeploymentTarget } from "../../../shared/domain/models.js";

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
  return definitions.map(step => ({ ...step, status: "pending", details: [] }));
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
      step.startedAt ??= index === 0 ? job.report!.startedAt : now;
      step.finishedAt ??= now;
      step.durationMs ??= Math.max(0, Date.parse(step.finishedAt) - Date.parse(step.startedAt));
      step.status = "completed";
    } else if (index === bounded && bounded < job.report!.steps.length) {
      step.status = "running";
      step.startedAt ??= now;
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
    active.status = status;
    active.startedAt ??= job.startedAt ?? job.report.startedAt;
    active.finishedAt = now;
    active.durationMs = Math.max(0, Date.parse(now) - Date.parse(active.startedAt));
    if (job.error && !active.details.includes(job.error)) active.details.push(job.error);
  }
  if (status === "completed") {
    for (const step of job.report.steps) {
      step.status = "completed";
      step.startedAt ??= job.report.startedAt;
      step.finishedAt ??= now;
      step.durationMs ??= Math.max(0, Date.parse(step.finishedAt) - Date.parse(step.startedAt));
    }
  } else {
    for (const step of job.report.steps) if (step.status === "pending") step.status = "skipped";
  }
  job.report.finishedAt = now;
  job.report.durationMs = Math.max(0, Date.parse(now) - Date.parse(job.report.startedAt));
}
