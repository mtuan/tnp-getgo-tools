import type { AppSettings, BackgroundJob } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function jobStatusLabel(status: BackgroundJob["status"], locale: AppSettings["locale"]) {
  return (locale === "vi" ? vi : en).jobs.statuses[status];
}

export function JobStatusBadge({ status, locale }: { status: BackgroundJob["status"]; locale: AppSettings["locale"] }) {
  const tone = status === "completed"
    ? "success"
    : status === "failed"
      ? "danger"
      : status === "queued" || status === "paused"
        ? "warning"
        : status === "running"
          ? "primary"
          : "neutral";

  return <ui.StatusBadge tone={tone}>{jobStatusLabel(status, locale)}</ui.StatusBadge>;
}
