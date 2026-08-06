import { useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, Globe2, Pause as PauseIcon, Play, Rocket, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, DeploymentComponent } from "../core/models";
import { Button, DataTable, ErrorFrame, PageHeader, Panel, TableActionButton, type DataColumn } from "./ui";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

export function DeploymentPage({
  locale,
  environment,
  onOpenJobs,
}: {
  locale: AppSettings["locale"];
  environment: AppSettings["environment"];
  onOpenJobs(): void;
}) {
  const copy = (locale === "vi" ? vi : en).deployment;
  const [busy, setBusy] = useState<DeploymentComponent | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BackgroundJobsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSnapshot(await window.getgo.getBackgroundJobs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const deploy = async (component: DeploymentComponent) => {
    if (environment === "production" && !window.confirm(copy.productionConfirm.replace("{component}", component === "web" ? copy.webTitle : copy.rulesTitle))) return;
    setBusy(component);
    setError(null);
    try {
      setSnapshot(await window.getgo.startDeployment(component, environment));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const deployments = snapshot?.jobs.filter((job) => job.kind === "deploy") ?? [];
  const control = async (job: BackgroundJob, action: "pause" | "resume" | "cancel" | "retry" | "delete") => {
    if (action === "cancel" && !window.confirm(copy.cancelConfirm.replace("{name}", job.name))) return;
    if (action === "delete" && !window.confirm(copy.deleteConfirm.replace("{name}", job.name))) return;
    setBusyJob(job.id);
    try {
      setSnapshot(action === "pause"
        ? await window.getgo.pauseBackgroundJob(job.id)
        : action === "resume"
          ? await window.getgo.resumeBackgroundJob(job.id)
          : action === "cancel"
            ? await window.getgo.cancelBackgroundJob(job.id)
            : action === "retry"
              ? await window.getgo.retryBackgroundJob(job.id)
              : await window.getgo.deleteBackgroundJob(job.id));
    } finally {
      setBusyJob(null);
    }
  };
  const columns: DataColumn<BackgroundJob>[] = [
    { key: "name", title: copy.job, render: (job) => <strong>{job.name}</strong> },
    { key: "status", title: copy.status, width: 120, render: (job) => <span className={`badge job-status job-status-${job.status}`}>{job.status}</span> },
    { key: "progress", title: copy.progress, render: (job) => <span>{job.progressLabel ?? "—"}</span> },
    { key: "action", title: copy.action, width: 140, align: "right", render: (job) => job.cancellable ? <div className="job-table-actions"><TableActionButton color="neutral" icon={job.status === "paused" ? <Play /> : <PauseIcon />} disabled={busyJob === job.id} aria-label={job.status === "paused" ? copy.resume : copy.pause} title={job.status === "paused" ? copy.resume : copy.pause} onClick={() => void control(job, job.status === "paused" ? "resume" : "pause")} /><TableActionButton color="danger" icon={<X />} loading={busyJob === job.id} aria-label={copy.cancel} title={copy.cancel} onClick={() => void control(job, "cancel")} /></div> : <div className="job-table-actions">{job.retryable && <TableActionButton color="primary" icon={<RotateCcw />} loading={busyJob === job.id} aria-label={copy.retry} title={copy.retry} onClick={() => void control(job, "retry")} />}<TableActionButton color="danger" icon={<Trash2 />} aria-label={copy.delete} title={copy.delete} loading={busyJob === job.id} onClick={() => void control(job, "delete")} /></div> },
  ];

  return <section className="deployment-page">
    <PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={<Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</Button>}
    />
    {error && <ErrorFrame message={error} />}
    <div className="deployment-grid">
      <Panel className="deployment-card">
        <div className="deployment-card-icon"><ShieldCheck /></div>
        <div className="deployment-card-copy"><h2>{copy.rulesTitle}</h2><p>{copy.rulesDescription}</p><ul><li>{copy.firestoreRules}</li><li>{copy.firestoreIndexes}</li><li>{copy.storageRules}</li></ul></div>
        <Button variant="solid" icon={<Rocket />} loading={busy === "firebase-rules"} disabled={busy !== null && busy !== "firebase-rules"} onClick={() => void deploy("firebase-rules")}>{copy.deployRules}</Button>
      </Panel>
      <Panel className="deployment-card">
        <div className="deployment-card-icon"><Globe2 /></div>
        <div className="deployment-card-copy"><h2>{copy.webTitle}</h2><p>{copy.webDescription}</p><ul><li>{copy.webBuild}</li><li>{copy.firebaseHosting}</li></ul></div>
        <Button variant="solid" icon={<Rocket />} loading={busy === "web"} disabled={busy !== null && busy !== "web"} onClick={() => void deploy("web")}>{copy.deployWeb}</Button>
      </Panel>
    </div>
    <section className="deployment-jobs">
      <div><h2>{copy.recentDeployments}</h2><Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openAllJobs}</Button></div>
      <DataTable ariaLabel={copy.recentDeployments} rows={deployments} columns={columns} rowKey={(job) => job.id} emptyText={copy.noDeployments} />
    </section>
  </section>;
}
