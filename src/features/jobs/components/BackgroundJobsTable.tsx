import { useEffect, useState } from "react";
import { ExternalLink, Eye, Pause as PauseIcon, Play, RotateCcw, Trash2, X } from "lucide-react";
import type { AppSettings, BackgroundJob } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { DeploymentJobReportDrawer } from "../../deployment/components/DeploymentJobReportDrawer";

export type BackgroundJobAction = "pause" | "resume" | "cancel" | "retry" | "delete";

function durationLabel(job: BackgroundJob, now: number) {
  const start = Date.parse(job.startedAt ?? job.createdAt);
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function BackgroundJobsTable({
  locale,
  rows,
  busyJob,
  emptyText,
  ariaLabel,
  onAction,
  onOpenRoute,
}: {
  locale: AppSettings["locale"];
  rows: BackgroundJob[];
  busyJob: string | null;
  emptyText: string;
  ariaLabel: string;
  onAction(job: BackgroundJob, action: BackgroundJobAction): void;
  onOpenRoute?(route: string): void;
}) {
  const copy = (locale === "vi" ? vi : en).jobs;
  const [now, setNow] = useState(Date.now());
  const [reportJobId, setReportJobId] = useState<string | null>(null);
  const reportJob = reportJobId ? rows.find(job => job.id === reportJobId) ?? null : null;
  const hasActive = rows.some((job) => ["queued", "running", "paused"].includes(job.status));
  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasActive]);
  const jobKind = (job: BackgroundJob) => job.kind === "ai-migrate" ? copy.aiMigration : job.kind === "publish" ? copy.publishing : copy.webDeployment;
  const columns: ui.DataColumn<BackgroundJob>[] = [
    { key: "name", title: copy.name, width: "22%", render: (job) => <div className="job-table-name"><strong>{job.name}</strong><small>{jobKind(job)}</small></div> },
    { key: "description", title: copy.description, render: (job) => <div className="job-table-description"><span>{job.description}</span>{job.progressLabel && <small className="job-table-current-step">{job.progressLabel}</small>}{job.error && <small className="job-table-error">{job.error}</small>}</div> },
    { key: "status", title: copy.status, width: 120, render: (job) => <span className={`badge job-status job-status-${job.status}`}>{job.status}</span> },
    { key: "progress", title: copy.progress, width: 190, render: (job) => { const percent = job.total ? Math.min(100, Math.round(job.completed / job.total * 100)) : 0; return <div className="job-table-progress"><div><progress max={100} value={percent} /><strong>{percent}%</strong></div><small>{job.completed}/{job.total}</small></div>; } },
    { key: "time", title: copy.time, width: 90, align: "right", render: (job) => <span className="job-table-time">{durationLabel(job, now)}</span> },
    { key: "actions", title: copy.action, width: 230, align: "right", render: (job) => <div className="job-table-actions"><ui.TableActionButton color="neutral" icon={<Eye />} aria-label={copy.viewReport} title={copy.viewReport} onClick={() => setReportJobId(job.id)} />{job.cancellable ? <><ui.TableActionButton color="neutral" icon={job.status === "paused" ? <Play /> : <PauseIcon />} disabled={busyJob === job.id} aria-label={job.status === "paused" ? copy.resume : copy.pause} title={job.status === "paused" ? copy.resume : copy.pause} onClick={() => onAction(job, job.status === "paused" ? "resume" : "pause")} /><ui.TableActionButton color="danger" icon={<X />} loading={busyJob === job.id} aria-label={copy.cancel} title={copy.cancel} onClick={() => onAction(job, "cancel")} /></> : <>{job.retryable && <ui.TableActionButton color="primary" icon={<RotateCcw />} loading={busyJob === job.id} aria-label={copy.retry} title={copy.retry} onClick={() => onAction(job, "retry")} />}{job.route && onOpenRoute && <ui.TableActionButton color="neutral" icon={<ExternalLink />} aria-label={copy.open} title={copy.open} onClick={() => onOpenRoute(job.route!)} />}<ui.TableActionButton color="danger" icon={<Trash2 />} aria-label={copy.delete} title={copy.delete} loading={busyJob === job.id} onClick={() => onAction(job, "delete")} /></>}</div> },
  ];
  return <><ui.DataTable horizontalScroll ariaLabel={ariaLabel} rows={rows} columns={columns} rowKey={(job) => job.id} emptyText={emptyText} />{reportJob && <DeploymentJobReportDrawer locale={locale} job={reportJob} onClose={() => setReportJobId(null)} />}</>;
}
