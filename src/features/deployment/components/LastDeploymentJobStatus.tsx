import type { AppSettings, BackgroundJob } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

function relativeTime(value: string, locale: AppSettings["locale"]): string {
  const elapsedSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1_000);
  const absoluteSeconds = Math.abs(elapsedSeconds);
  const formatter = new Intl.RelativeTimeFormat(locale === "vi" ? "vi" : "en", { numeric: "auto" });
  if (absoluteSeconds < 60) return formatter.format(elapsedSeconds, "second");
  if (absoluteSeconds < 3_600) return formatter.format(Math.round(elapsedSeconds / 60), "minute");
  if (absoluteSeconds < 86_400) return formatter.format(Math.round(elapsedSeconds / 3_600), "hour");
  if (absoluteSeconds < 2_592_000) return formatter.format(Math.round(elapsedSeconds / 86_400), "day");
  if (absoluteSeconds < 31_536_000) return formatter.format(Math.round(elapsedSeconds / 2_592_000), "month");
  return formatter.format(Math.round(elapsedSeconds / 31_536_000), "year");
}

function statusLabel(job: BackgroundJob, locale: AppSettings["locale"], localhost: boolean): string {
  const copy = (locale === "vi" ? vi : en).deployment.lastJob;
  if (localhost && job.operation === "run") {
    if (job.status === "failed") return copy.startFailed;
    if (job.status === "cancelled") return copy.startCancelled;
    return copy.started;
  }
  const operation = job.operation ?? "deploy";
  const labels = copy[operation];
  return labels[job.status];
}

export function LastDeploymentJobStatus({
  job,
  locale,
  localhost = false,
}: {
  job?: BackgroundJob;
  locale: AppSettings["locale"];
  localhost?: boolean;
}) {
  const copy = (locale === "vi" ? vi : en).deployment.lastJob;
  if (!job) return <p className="deployment-last-job deployment-last-job-empty">{copy.none}</p>;
  const timestamp = ["completed", "failed", "cancelled"].includes(job.status)
    ? job.finishedAt ?? job.startedAt ?? job.createdAt
    : job.startedAt ?? job.createdAt;
  return (
    <p className={`deployment-last-job deployment-last-job-${job.status}`}>
      <strong>{statusLabel(job, locale, localhost)}</strong>
      <span>{relativeTime(timestamp, locale)}</span>
    </p>
  );
}
