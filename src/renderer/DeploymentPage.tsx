import { useCallback, useEffect, useState } from "react";
import { BriefcaseBusiness, Globe2, Rocket, ShieldCheck } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, DeploymentComponent, DeploymentOperation, DeploymentStateSnapshot } from "../core/models";
import { Button, ErrorFrame, PageHeader, Panel } from "./ui";
import { BackgroundJobsTable, type BackgroundJobAction } from "./BackgroundJobsTable";
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
  const [deploymentState, setDeploymentState] = useState<DeploymentStateSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [jobs, state] = await Promise.all([
        window.getgo.getBackgroundJobs(),
        window.getgo.getDeploymentState(environment),
      ]);
      setSnapshot(jobs);
      setDeploymentState(state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [environment]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (operation: DeploymentOperation, component: DeploymentComponent) => {
    if (operation === "deploy" && environment === "production" && !window.confirm(copy.productionConfirm.replace("{component}", component === "web" ? copy.webTitle : copy.rulesTitle))) return;
    setBusy(component);
    setError(null);
    try {
      setSnapshot(await window.getgo.startDeployment(operation, component, environment));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const deployments = snapshot?.jobs.filter((job) => job.kind === "deploy") ?? [];
  const activeJobs = deployments.filter((job) => ["queued", "running", "paused"].includes(job.status));
  const componentIsActive = (component: DeploymentComponent) =>
    activeJobs.some((job) => job.component === component);
  const operationIsRunning = (component: DeploymentComponent, operation: DeploymentOperation) =>
    activeJobs.some((job) => job.status !== "paused" && job.component === component && job.operation === operation);
  const shortHash = (hash: string | null) => hash ? `${hash.slice(0, 10)}…` : "—";
  const stateCopy = (status?: string) => status === "up-to-date" ? copy.upToDate : status === "changed" ? copy.changesDetected : status === "not-deployed" ? copy.notDeployed : copy.buildRequired;
  const control = async (job: BackgroundJob, action: BackgroundJobAction) => {
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
        <div className="deployment-card-copy"><div className="deployment-card-title"><h2>{copy.rulesTitle}</h2><span className={`badge deployment-state-${deploymentState?.rules.status ?? "build-required"}`}>{stateCopy(deploymentState?.rules.status)}</span></div><p>{copy.rulesDescription}</p><ul>{deploymentState?.rules.items.map((item) => <li key={item.id}><span>{item.id === "firestore-rules" ? copy.firestoreRules : item.id === "firestore-indexes" ? copy.firestoreIndexes : copy.storageRules}</span><code>{shortHash(item.localHash)} / {shortHash(item.deployedHash)}</code><strong>{item.changed ? copy.changed : copy.unchanged}</strong></li>) ?? <li>{copy.buildRequired}</li>}</ul></div>
        <div className="deployment-card-actions"><Button icon={<Rocket />} loading={busy === "firebase-rules" || operationIsRunning("firebase-rules", "build")} disabled={componentIsActive("firebase-rules")} onClick={() => void run("build", "firebase-rules")}>{deploymentState?.rules.builtAt ? copy.rebuild : copy.buildLocal}</Button><Button variant="solid" icon={<Rocket />} loading={operationIsRunning("firebase-rules", "deploy")} disabled={componentIsActive("firebase-rules") || !deploymentState?.rules.builtAt || deploymentState.rules.status === "up-to-date"} onClick={() => void run("deploy", "firebase-rules")}>{copy.deployRules}</Button></div>
      </Panel>
      <Panel className="deployment-card">
        <div className="deployment-card-icon"><Globe2 /></div>
        <div className="deployment-card-copy"><div className="deployment-card-title"><h2>{copy.webTitle}</h2><span className={`badge deployment-state-${deploymentState?.web.status ?? "build-required"}`}>{stateCopy(deploymentState?.web.status)}</span></div><p>{copy.webDescription}</p><ul>{deploymentState?.web.items.map((item) => <li key={item.id}><span>{copy.firebaseHosting}</span><code>{shortHash(item.localHash)} / {shortHash(item.deployedHash)}</code><strong>{item.changed ? copy.changed : copy.unchanged}</strong></li>) ?? <li>{copy.buildRequired}</li>}</ul></div>
        <div className="deployment-card-actions"><Button icon={<Rocket />} loading={busy === "web" || operationIsRunning("web", "build")} disabled={componentIsActive("web")} onClick={() => void run("build", "web")}>{deploymentState?.web.builtAt ? copy.rebuild : copy.buildLocal}</Button><Button variant="solid" icon={<Rocket />} loading={operationIsRunning("web", "deploy")} disabled={componentIsActive("web") || !deploymentState?.web.builtAt || deploymentState.web.status === "up-to-date"} onClick={() => void run("deploy", "web")}>{copy.deployWeb}</Button></div>
      </Panel>
    </div>
    <section className="deployment-jobs">
      <div><h2>{copy.recentDeployments}</h2><Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openAllJobs}</Button></div>
      <BackgroundJobsTable locale={locale} ariaLabel={copy.recentDeployments} rows={deployments} busyJob={busyJob} emptyText={copy.noDeployments} onAction={(job, action) => void control(job, action)} />
    </section>
  </section>;
}
