import { useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, Globe2, Rocket, ShieldCheck } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, DeploymentComponent, WebDeploymentTarget } from "../core/models";
import { Button, DataTable, ErrorFrame, PageHeader, Panel, SegmentedControl, type DataColumn } from "./ui";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

export function DeploymentPage({
  locale,
  onOpenJobs,
}: {
  locale: AppSettings["locale"];
  onOpenJobs(): void;
}) {
  const copy = (locale === "vi" ? vi : en).deployment;
  const [target, setTarget] = useState<WebDeploymentTarget>("development");
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
    if (target === "production" && !window.confirm(copy.productionConfirm.replace("{component}", component === "web" ? copy.webTitle : copy.rulesTitle))) return;
    setBusy(component);
    setError(null);
    try {
      setSnapshot(await window.getgo.startDeployment(component, target));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const targetOptions = [
    { value: "development", label: copy.development },
    { value: "staging", label: copy.staging },
    { value: "production", label: copy.production },
  ];
  const deployments = snapshot?.jobs.filter((job) => job.kind === "deploy") ?? [];
  const control = async (job: BackgroundJob, action: "pause" | "resume" | "cancel") => {
    if (action === "cancel" && !window.confirm(copy.cancelConfirm.replace("{name}", job.name))) return;
    setBusyJob(job.id);
    try {
      setSnapshot(action === "pause"
        ? await window.getgo.pauseBackgroundJob(job.id)
        : action === "resume"
          ? await window.getgo.resumeBackgroundJob(job.id)
          : await window.getgo.cancelBackgroundJob(job.id));
    } finally {
      setBusyJob(null);
    }
  };
  const columns: DataColumn<BackgroundJob>[] = [
    { key: "name", title: copy.job, render: (job) => <strong>{job.name}</strong> },
    { key: "status", title: copy.status, width: 120, render: (job) => <span className={`badge job-status job-status-${job.status}`}>{job.status}</span> },
    { key: "progress", title: copy.progress, render: (job) => <span>{job.progressLabel ?? "—"}</span> },
    { key: "action", title: copy.action, width: 190, align: "right", render: (job) => job.cancellable ? <div className="job-table-actions"><Button color="neutral" disabled={busyJob === job.id} onClick={() => void control(job, job.status === "paused" ? "resume" : "pause")}>{job.status === "paused" ? copy.resume : copy.pause}</Button><Button color="danger" loading={busyJob === job.id} onClick={() => void control(job, "cancel")}>{copy.cancel}</Button></div> : "—" },
  ];

  return <section className="deployment-page">
    <PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={<Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</Button>}
    />
    <div className="deployment-target">
      <div><strong>{copy.target}</strong><span>{copy.targetDescription}</span></div>
      <SegmentedControl value={target} options={targetOptions} disabled={busy !== null} ariaLabel={copy.target} onValueChange={(value) => setTarget(value as WebDeploymentTarget)} />
    </div>
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
