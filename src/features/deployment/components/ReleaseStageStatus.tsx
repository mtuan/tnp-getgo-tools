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
  if (job.releaseStageOutcomes?.[stage] === "up-to-date" || job.releaseStageOutcomes?.[stage] === "warning") return undefined;
  // Backfill the result for release records created before stage outcomes were
  // persisted. These jobs completed successfully but explicitly deployed no
  // resources, so they must not replace the last real deployment timestamp.
  if (stage === "web" && job.logs?.some(log =>
    log.message.includes("No deployable changes remain")
    || log.message.includes("Nothing changed since last deploy")
  )) return undefined;
  const exact = job.releaseStageFinishedAt?.[stage];
  if (exact) return exact;
  return job.status === "completed" && includesStage(job.releaseScope, stage) ? job.finishedAt : undefined;
}

function wasVerifiedUpToDate(job: BackgroundJob | undefined, stage: ReleaseStage) {
  if (!job || job.status !== "completed") return false;
  if (job.releaseStageOutcomes?.[stage] === "up-to-date") return true;
  return stage === "web" && Boolean(job.logs?.some(log =>
    log.message.includes("No deployable changes remain")
    || log.message.includes("Nothing changed since last deploy")
  ));
}

function completedWithWarnings(job: BackgroundJob | undefined, stage: ReleaseStage) {
  if (!job || job.status !== "completed") return false;
  if (job.releaseStageOutcomes?.[stage] === "warning") return true;
  return stage === "web" && Boolean(job.logs?.some(log => log.message.includes("skipped (missing secret)")));
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
  const warning = !active && !failed && completedWithWarnings(latest, stage);
  const upToDate = !active && !failed && !warning && wasVerifiedUpToDate(latest, stage);
  const label = active ? copy.deploying : failed ? copy.failed : warning ? copy.warning : upToDate ? copy.upToDate : lastDeployedAt ? copy.deployed : copy.notDeployed;
  const tone = active || warning ? "warning" : failed ? "danger" : upToDate || lastDeployedAt ? "success" : "neutral";
  const date = lastDeployedAt
    ? new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastDeployedAt))
    : null;
  return <div className="release-stage-status">
    <ui.StatusBadge tone={tone}>{label}</ui.StatusBadge>
    <time dateTime={lastDeployedAt}>{date ? copy.lastDeployed.replace("{date}", date) : copy.noDeployment}</time>
  </div>;
}
