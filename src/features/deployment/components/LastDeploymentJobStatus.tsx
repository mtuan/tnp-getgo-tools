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

function duration(value: number, locale: AppSettings["locale"]): string {
  const seconds = Math.max(0, Math.round(value / 1_000));
  const formatter = new Intl.NumberFormat(locale === "vi" ? "vi" : "en");
  if (seconds < 60) return `${formatter.format(seconds)}${locale === "vi" ? " giây" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${formatter.format(minutes)}${locale === "vi" ? " phút" : "m"}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const hourText = `${formatter.format(hours)}${locale === "vi" ? " giờ" : "h"}`;
  return remainingMinutes ? `${hourText} ${formatter.format(remainingMinutes)}${locale === "vi" ? " phút" : "m"}` : hourText;
}

function jobDuration(job: BackgroundJob): number | undefined {
  if (typeof job.durationMs === "number") return job.durationMs;
  if (typeof job.report?.durationMs === "number") return job.report.durationMs;
  if (!job.startedAt || !job.finishedAt) return undefined;
  return Math.max(0, Date.parse(job.finishedAt) - Date.parse(job.startedAt));
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
  const timestamp = job.startedAt ?? job.createdAt;
  const elapsed = jobDuration(job);
  const showDuration = elapsed !== undefined && (localhost || ["completed", "failed", "cancelled"].includes(job.status));
  const label = localhost && showDuration ? copy.localhostBuilt : statusLabel(job, locale, localhost);
  return (
    <p className={`deployment-last-job deployment-last-job-${job.status}`}>
      <strong>{label}{showDuration ? ` ${copy.inDuration} ${duration(elapsed, locale)}` : ""}</strong>
      <span>{copy.startedAt} {relativeTime(timestamp, locale)}</span>
    </p>
  );
}
