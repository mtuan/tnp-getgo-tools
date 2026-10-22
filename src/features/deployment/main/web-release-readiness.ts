import type {
  ReleaseDoctorCheck,
  WebDeploymentTarget,
  WebReleaseReadiness,
  WebReleaseReadinessCheck,
  WebReleaseSummary,
} from "../../../shared/domain/models.js";

type ReleaseTarget = Exclude<WebDeploymentTarget, "development">;

export function createWebReleaseReadiness(
  target: ReleaseTarget,
  release: WebReleaseSummary,
  environment: ReleaseDoctorCheck,
): WebReleaseReadiness {
  const checks: WebReleaseReadinessCheck[] = [
    {
      id: "artifact",
      status: release.artifactBytes > 0 ? "ready" : "action-required",
      title: "Immutable release artifact",
      summary: release.artifactBytes > 0
        ? `${release.releaseId} is archived and ready to deploy.`
        : `${release.releaseId} does not contain a usable release archive.`,
      details: release.artifactBytes > 0
        ? [`Git commit: ${release.gitCommit}`, `Archive size: ${release.artifactBytes} bytes`]
        : [],
    },
    {
      ...environment,
      id: "environment",
      status: environment.status === "checking" ? "action-required" : environment.status,
    },
  ];
  if (target === "production") checks.push({
    id: "staging",
    status: release.stagingStatus === "deployed" ? "ready" : "action-required",
    title: "Staging deployment",
    summary: release.stagingStatus === "deployed"
      ? `${release.releaseId} has been deployed to staging${release.stagingDeployedAt ? ` at ${release.stagingDeployedAt}` : ""}.`
      : "Deploy this exact immutable build to staging before production.",
    details: [],
  });
  return {
    target,
    releaseId: release.releaseId,
    checkedAt: new Date().toISOString(),
    ready: checks.every(check => check.status === "ready"),
    checks,
  };
}
