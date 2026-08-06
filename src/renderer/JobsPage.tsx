import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Pause as PauseIcon, Play, RotateCcw, Trash2, X } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot } from "../core/models";
import { Button, DataTable, ErrorFrame, PageHeader, SegmentedControl, TableActionButton, type DataColumn } from "./ui";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

const activeStatuses = new Set(["queued", "running", "paused"]);

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

export function JobsPage({
  locale,
  onOpenQuiz,
}: {
  locale: AppSettings["locale"];
  onOpenQuiz(route: string): void;
}) {
  const copy = (locale === "vi" ? vi : en).jobs;
  const [snapshot, setSnapshot] = useState<BackgroundJobsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [savingConcurrency, setSavingConcurrency] = useState(false);
  const [now, setNow] = useState(Date.now());
  const hasActiveJobs = snapshot?.jobs.some((job) => activeStatuses.has(job.status)) ?? false;

  const load = useCallback(async () => {
    try {
      setSnapshot(await window.getgo.getBackgroundJobs());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), hasActiveJobs ? 750 : 2500);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs, load]);
  useEffect(() => {
    if (!hasActiveJobs) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveJobs]);

  const setConcurrency = async (value: string) => {
    setSavingConcurrency(true);
    try {
      await window.getgo.setAiMigrationConcurrency(Number(value));
      await load();
    } finally {
      setSavingConcurrency(false);
    }
  };

  const cancel = async (job: BackgroundJob) => {
    if (!window.confirm(copy.cancelConfirm.replace("{name}", job.name))) return;
    setBusyJob(job.id);
    try {
      setSnapshot(await window.getgo.cancelBackgroundJob(job.id));
    } finally {
      setBusyJob(null);
    }
  };

  const changeExecution = async (job: BackgroundJob, action: "pause" | "resume") => {
    setBusyJob(job.id);
    try {
      setSnapshot(action === "pause"
        ? await window.getgo.pauseBackgroundJob(job.id)
        : await window.getgo.resumeBackgroundJob(job.id));
    } finally {
      setBusyJob(null);
    }
  };

  const terminalAction = async (job: BackgroundJob, action: "retry" | "delete") => {
    if (action === "delete" && !window.confirm(copy.deleteConfirm.replace("{name}", job.name))) return;
    setBusyJob(job.id);
    try {
      setSnapshot(action === "retry"
        ? await window.getgo.retryBackgroundJob(job.id)
        : await window.getgo.deleteBackgroundJob(job.id));
    } finally {
      setBusyJob(null);
    }
  };

  const jobKind = (job: BackgroundJob) =>
    job.kind === "ai-migrate" ? copy.aiMigration : job.kind === "publish" ? copy.publishing : copy.webDeployment;

  const columns: DataColumn<BackgroundJob>[] = [
    { key: "name", title: copy.name, width: "22%", render: (job) => <div className="job-table-name"><strong>{job.name}</strong><small>{jobKind(job)}</small></div> },
    { key: "description", title: copy.description, render: (job) => <div className="job-table-description"><span>{job.description}</span>{job.error && <small>{job.error}</small>}</div> },
    { key: "status", title: copy.status, width: 120, render: (job) => <span className={`badge job-status job-status-${job.status}`}>{job.status}</span> },
    { key: "progress", title: copy.progress, width: 180, render: (job) => { const percent = job.total ? Math.min(100, Math.round(job.completed / job.total * 100)) : 0; return <div className="job-table-progress"><div><progress max={100} value={percent} /><strong>{percent}%</strong></div><small>{job.progressLabel}</small></div>; } },
    { key: "time", title: copy.time, width: 90, align: "right", render: (job) => <span className="job-table-time">{durationLabel(job, now)}</span> },
    { key: "actions", title: copy.action, width: 190, align: "right", render: (job) => job.cancellable ? <div className="job-table-actions"><TableActionButton color="neutral" icon={job.status === "paused" ? <Play /> : <PauseIcon />} disabled={busyJob === job.id} aria-label={job.status === "paused" ? copy.resume : copy.pause} title={job.status === "paused" ? copy.resume : copy.pause} onClick={(event) => { event.stopPropagation(); void changeExecution(job, job.status === "paused" ? "resume" : "pause"); }} /><TableActionButton color="danger" icon={<X />} loading={busyJob === job.id} aria-label={copy.cancel} title={copy.cancel} onClick={(event) => { event.stopPropagation(); void cancel(job); }} /></div> : <div className="job-table-actions">{job.retryable && <TableActionButton color="primary" icon={<RotateCcw />} loading={busyJob === job.id} aria-label={copy.retry} title={copy.retry} onClick={() => void terminalAction(job, "retry")} />}{job.route && <TableActionButton color="neutral" icon={<ExternalLink />} aria-label={copy.open} title={copy.open} onClick={() => onOpenQuiz(job.route!)} />}<TableActionButton color="danger" icon={<Trash2 />} aria-label={copy.delete} title={copy.delete} loading={busyJob === job.id} onClick={() => void terminalAction(job, "delete")} /></div> },
  ];

  return <section className="jobs-page">
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.pageDescription} actions={<><Button icon={<ExternalLink />} onClick={() => void window.getgo.openExternal("https://platform.openai.com/usage")}>{copy.openAiUsage}</Button>{snapshot && <div className="jobs-concurrency"><span>{copy.concurrentAiJobs}</span><SegmentedControl value={String(snapshot.aiConcurrency)} options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: String(value) }))} disabled={savingConcurrency} ariaLabel={copy.concurrentAiJobs} onValueChange={(value) => void setConcurrency(value)} /></div>}</>} />
    {error && <div className="jobs-load-error"><ErrorFrame message={error} /><Button onClick={() => void load()}>{copy.retry}</Button></div>}
    {!error && snapshot &&
      <DataTable ariaLabel={copy.recentJobs} rows={snapshot.jobs} columns={columns} rowKey={(job) => job.id} emptyText={copy.empty} />
    }
  </section>;
}
