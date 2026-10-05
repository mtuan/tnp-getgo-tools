import type { AppSettings, BackgroundJob, ReleaseScope } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

type ReleaseStage = "web" | "ios" | "android";

function includesStage(scope: ReleaseScope | undefined, stage: ReleaseStage) {
  const actualScope = scope ?? "all";
  return stage === "web" || actualScope === "all" || actualScope === stage;
}

function completedAt(job: BackgroundJob, stage: ReleaseStage) {
  const exact = job.releaseStageFinishedAt?.[stage];
  if (exact) return exact;
  return job.status === "completed" && includesStage(job.releaseScope, stage) ? job.finishedAt : undefined;
}

export function ReleaseStageStatus({ stage, jobs, locale, fallbackDeployedAt }: {
  stage: ReleaseStage;
  jobs: BackgroundJob[];
  locale: AppSettings["locale"];
  fallbackDeployedAt?: string;
}) {
  const copy = (locale === "vi" ? vi : en).deployment.release.stageStatus;
  const relevant = jobs.filter(job => includesStage(job.releaseScope, stage));
  const latest = relevant[0];
  const lastDeployedAt = relevant.map(job => completedAt(job, stage)).find(Boolean) ?? fallbackDeployedAt;
  const active = latest && ["queued", "running", "paused"].includes(latest.status);
  const failed = latest?.status === "failed" && !completedAt(latest, stage);
  const label = active ? copy.deploying : failed ? copy.failed : lastDeployedAt ? copy.deployed : copy.notDeployed;
  const tone = active ? "warning" : failed ? "danger" : lastDeployedAt ? "success" : "neutral";
  const date = lastDeployedAt
    ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastDeployedAt))
    : null;
  return <div className="release-stage-status">
    <ui.StatusBadge tone={tone}>{label}</ui.StatusBadge>
    <time dateTime={lastDeployedAt}>{date ? copy.lastDeployed.replace("{date}", date) : copy.noDeployment}</time>
  </div>;
}
