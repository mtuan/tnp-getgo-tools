import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot } from "../../../shared/domain/models";
import { Button, ErrorFrame, PageHeader, PageLoading, Pagination, ProcessingOverlay, usePagination } from "../../../shared/ui";
import { BackgroundJobsTable, type BackgroundJobAction } from "../components/BackgroundJobsTable";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

const activeStatuses = new Set(["queued", "running", "paused"]);

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
  const [clearingFinished, setClearingFinished] = useState(false);
  const hasActiveJobs = snapshot?.jobs.some((job) => activeStatuses.has(job.status)) ?? false;
  const jobs = snapshot?.jobs ?? [];
  const pagination = usePagination(jobs);

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

  const jobAction = (job: BackgroundJob, action: BackgroundJobAction) => {
    if (action === "cancel") void cancel(job);
    else if (action === "pause" || action === "resume") void changeExecution(job, action);
    else void terminalAction(job, action);
  };

  const clearFinished = async () => {
    if (!window.confirm(copy.clearFinishedConfirm)) return;
    setClearingFinished(true);
    try {
      setSnapshot(await window.getgo.clearFinishedBackgroundJobs());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setClearingFinished(false);
    }
  };

  const finishedCount = jobs.filter((job) => !activeStatuses.has(job.status)).length;

  if (!error && snapshot === null) return <PageLoading label={locale === "vi" ? "Đang tải trang" : "Loading page"} />;
  return <section className="jobs-page">
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.pageDescription} actions={<Button variant="solid" color="danger" icon={<Trash2 />} disabled={!finishedCount || clearingFinished} onClick={() => void clearFinished()}>{copy.clearFinished}</Button>} />
    {error && <div className="jobs-load-error"><ErrorFrame message={error} /><Button onClick={() => void load()}>{copy.retry}</Button></div>}
    {!error && snapshot && <>
      <BackgroundJobsTable locale={locale} ariaLabel={copy.recentJobs} rows={pagination.pageItems} busyJob={busyJob} emptyText={copy.empty} onAction={jobAction} onOpenRoute={onOpenQuiz} />
      <Pagination locale={locale} page={pagination.page} pageCount={pagination.pageCount} onPageChange={pagination.setPage} />
    </>}
    <ProcessingOverlay open={clearingFinished} title={copy.clearingFinished} />
  </section>;
}
