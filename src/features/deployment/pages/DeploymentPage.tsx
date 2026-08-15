import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, ExternalLink, Globe2, MonitorCog, Power, Rocket, RotateCw, ShieldCheck } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, DeploymentComponent, DeploymentOperation, DeploymentStateSnapshot, LocalWebRuntimeSnapshot } from "../../../shared/domain/models";
import { Button, ErrorFrame, PageHeader, Panel } from "../../../shared/ui";
import { BackgroundJobsTable, type BackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

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
  const [localWeb, setLocalWeb] = useState<LocalWebRuntimeSnapshot | null>(null);
  const [localWebAction, setLocalWebAction] = useState<"start" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const environmentRef = useRef(environment);
  environmentRef.current = environment;

  const loadJobs = useCallback(async () => {
    try {
      setSnapshot(await window.getgo.getBackgroundJobs());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const loadDeploymentState = useCallback(async () => {
    const requestedEnvironment = environment;
    try {
      const state = await window.getgo.getDeploymentState(requestedEnvironment);
      if (environmentRef.current === requestedEnvironment) setDeploymentState(state);
    } catch (cause) {
      if (environmentRef.current === requestedEnvironment) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [environment]);

  const loadLocalWeb = useCallback(async () => {
    try {
      setLocalWeb(await window.getgo.getLocalWebRuntime());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    setDeploymentState(null);
    void loadDeploymentState();
    const timer = window.setInterval(() => void loadDeploymentState(), 250);
    return () => window.clearInterval(timer);
  }, [loadDeploymentState]);
  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 500);
    return () => window.clearInterval(timer);
  }, [loadJobs]);
  useEffect(() => {
    void loadLocalWeb();
    const timer = window.setInterval(() => void loadLocalWeb(), 2000);
    return () => window.clearInterval(timer);
  }, [loadLocalWeb]);

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

  const controlLocalWeb = async (action: "start" | "restart") => {
    setLocalWebAction(action);
    setError(null);
    try {
      setLocalWeb(action === "start"
        ? await window.getgo.startLocalWebRuntime()
        : await window.getgo.restartLocalWebRuntime());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLocalWebAction(null);
    }
  };

  const deployments = snapshot?.jobs.filter((job) => job.kind === "deploy") ?? [];
  const activeJobs = deployments.filter((job) => ["queued", "running", "paused"].includes(job.status));
  const componentIsActive = (component: DeploymentComponent) =>
    activeJobs.some((job) => job.component === component);
  const deploymentIsActive = activeJobs.some((job) => job.operation === "deploy");
  const operationIsRunning = (component: DeploymentComponent, operation: DeploymentOperation) =>
    activeJobs.some((job) => job.status !== "paused" && job.component === component && job.operation === operation);
  const componentControlsLocked = (component: DeploymentComponent) =>
    busy === component || componentIsActive(component);
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
        <div className="deployment-card-copy"><div className="deployment-card-title"><h2>{copy.rulesTitle}</h2><span className={`badge deployment-state-${deploymentState?.rules.status ?? "build-required"}`}>{stateCopy(deploymentState?.rules.status)}</span></div><p>{copy.rulesDescription}</p><ul>{deploymentState?.rules.items.map((item) => <li key={item.id}><span>{item.id === "firestore-rules" ? copy.firestoreRules : item.id === "firestore-indexes" ? copy.firestoreIndexes : item.id === "storage-rules" ? copy.storageRules : copy.cloudFunctions}</span><code>{shortHash(item.localHash)} / {shortHash(item.deployedHash)}</code><strong>{item.changed ? copy.changed : copy.unchanged}</strong></li>) ?? <li>{copy.buildRequired}</li>}<li><span>{copy.localVersion}</span><code>{deploymentState?.rules.buildVersion ?? "—"}</code><strong>{deploymentState?.rules.builtAt ? new Date(deploymentState.rules.builtAt).toLocaleString(locale) : "—"}</strong></li><li><span>{copy.deployedVersion}</span><code>{deploymentState?.rules.deployedVersion ?? "—"}</code><strong>{deploymentState?.rules.deployedAt ? new Date(deploymentState.rules.deployedAt).toLocaleString(locale) : "—"}</strong></li></ul></div>
        <div className="deployment-card-actions"><Button icon={<ExternalLink />} disabled={!deploymentState?.firebaseConsoleUrl} onClick={() => deploymentState && void window.getgo.openExternal(deploymentState.firebaseConsoleUrl)}>{copy.openFirebase}</Button><Button icon={<Rocket />} loading={busy === "firebase" || operationIsRunning("firebase", "build")} disabled={componentControlsLocked("firebase")} onClick={() => void run("build", "firebase")}>{copy.buildLocal}</Button><Button variant="solid" icon={<Rocket />} loading={operationIsRunning("firebase", "deploy")} disabled={componentControlsLocked("firebase") || deploymentIsActive || !deploymentState?.rules.builtAt || deploymentState.rules.status === "up-to-date"} onClick={() => void run("deploy", "firebase")}>{copy.deployRules}</Button></div>
      </Panel>
      <Panel className="deployment-card">
        <div className="deployment-card-icon"><Globe2 /></div>
        <div className="deployment-card-copy"><div className="deployment-card-title"><h2>{copy.webTitle}</h2><span className={`badge deployment-state-${deploymentState?.web.status ?? "build-required"}`}>{stateCopy(deploymentState?.web.status)}</span></div><p>{copy.webDescription}</p><ul>{deploymentState?.web.items.map((item) => <li key={item.id}><span>{copy.firebaseHosting}</span><code>{shortHash(item.localHash)} / {shortHash(item.deployedHash)}</code><strong>{item.changed ? copy.changed : copy.unchanged}</strong></li>) ?? <li>{copy.buildRequired}</li>}<li><span>{copy.localVersion}</span><code>{deploymentState?.web.buildVersion ?? "—"}</code><strong>{deploymentState?.web.builtAt ? new Date(deploymentState.web.builtAt).toLocaleString(locale) : "—"}</strong></li><li><span>{copy.deployedVersion}</span><code>{deploymentState?.web.deployedVersion ?? "—"}</code><strong>{deploymentState?.web.deployedAt ? new Date(deploymentState.web.deployedAt).toLocaleString(locale) : "—"}</strong></li></ul></div>
        <div className="deployment-card-actions"><Button icon={<ExternalLink />} disabled={!deploymentState?.webUrl} onClick={() => deploymentState && void window.getgo.openExternal(deploymentState.webUrl)}>{copy.openWeb}</Button><Button icon={<Rocket />} loading={busy === "web" || operationIsRunning("web", "build")} disabled={componentControlsLocked("web")} onClick={() => void run("build", "web")}>{copy.buildLocal}</Button><Button variant="solid" icon={<Rocket />} loading={operationIsRunning("web", "deploy")} disabled={componentControlsLocked("web") || deploymentIsActive || !deploymentState?.web.builtAt || deploymentState.web.status === "up-to-date"} onClick={() => void run("deploy", "web")}>{copy.deployWeb}</Button></div>
      </Panel>
      <Panel className="deployment-card deployment-card-localhost">
        <div className="deployment-card-icon"><MonitorCog /></div>
        <div className="deployment-card-copy">
          <div className="deployment-card-title"><h2>{copy.localhostTitle}</h2><span className={`badge local-web-state-${localWeb?.status ?? "offline"}`}>{localWeb?.status === "online" ? copy.online : localWeb?.status === "starting" ? copy.starting : localWeb?.status === "error" ? copy.failed : copy.offline}</span></div>
          <p>{copy.localhostDescription}</p>
          <ul>
            <li><span>{copy.localhostAddress}</span><code>{localWeb?.url ?? "http://localhost:5173"}</code><strong>{localWeb?.managed ? copy.managedByTools : copy.notManaged}</strong></li>
            <li><span>{copy.localhostEnvironment}</span><code>{copy.development}</code><strong>{localWeb?.pid ? `PID ${localWeb.pid}` : "—"}</strong></li>
          </ul>
          {localWeb?.error && <p className="local-web-error">{localWeb.error}</p>}
        </div>
        <div className="deployment-card-actions">
          <Button icon={<ExternalLink />} disabled={localWeb?.status !== "online"} onClick={() => localWeb && void window.getgo.openExternal(localWeb.url)}>{copy.openLocalhost}</Button>
          {localWeb?.managed
            ? <Button variant="solid" icon={<RotateCw />} loading={localWebAction === "restart"} onClick={() => void controlLocalWeb("restart")}>{copy.restartLocalhost}</Button>
            : <Button variant="solid" icon={<Power />} loading={localWebAction === "start"} disabled={localWeb?.status === "online"} onClick={() => void controlLocalWeb("start")}>{copy.runLocalhost}</Button>}
        </div>
      </Panel>
    </div>
    <section className="deployment-jobs">
      <div><h2>{copy.recentDeployments}</h2><Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openAllJobs}</Button></div>
      <BackgroundJobsTable locale={locale} ariaLabel={copy.recentDeployments} rows={deployments} busyJob={busyJob} emptyText={copy.noDeployments} onAction={(job, action) => void control(job, action)} />
    </section>
  </section>;
}
