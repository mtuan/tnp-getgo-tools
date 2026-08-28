import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, ExternalLink, Eye, MonitorCog, Power, RotateCw } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, DeploymentComponent, DeploymentOperation, DeploymentStateSnapshot, LocalWebRuntimeSnapshot } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { BackgroundJobsTable, type BackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";
import { DeploymentServiceCards } from "../components/DeploymentServiceCards";
import { DeploymentJobReportDrawer } from "../components/DeploymentJobReportDrawer";
import { NativeDeploymentCards } from "../components/NativeDeploymentCards";
import { useAuth } from "../../authentication/components/AuthContext";
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
  const { requireAuth } = useAuth();
  const [busy, setBusy] = useState<DeploymentComponent | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BackgroundJobsSnapshot | null>(null);
  const [deploymentState, setDeploymentState] = useState<DeploymentStateSnapshot | null>(null);
  const [localWeb, setLocalWeb] = useState<LocalWebRuntimeSnapshot | null>(null);
  const [localWebAction, setLocalWebAction] = useState<"start" | "restart" | null>(null);
  const localWebActionRef = useRef<"start" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logSelection, setLogSelection] = useState<DeploymentComponent | "localhost" | null>(null);
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
      const state = await window.getgo.getLocalWebRuntime();
      if (!localWebActionRef.current) setLocalWeb(state);
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

  const executeRun = async (operation: DeploymentOperation, component: DeploymentComponent) => {
    const componentName = component === "web" ? copy.webTitle : component === "firebase" ? copy.rulesTitle : component === "mobile-ios" ? copy.iosTitle : copy.androidTitle;
    if (operation === "deploy" && environment === "production" && !window.confirm(copy.productionConfirm.replace("{component}", componentName))) return;
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
  const run = (operation: DeploymentOperation, component: DeploymentComponent) => {
    if (operation === "deploy") requireAuth(() => executeRun(operation, component));
    else void executeRun(operation, component);
  };

  const controlLocalWeb = async (action: "start" | "restart") => {
    localWebActionRef.current = action;
    setLocalWebAction(action);
    setLocalWeb(current => current ? { ...current, status: "starting", error: undefined } : current);
    setError(null);
    try {
      setLocalWeb(action === "start"
        ? await window.getgo.startLocalWebRuntime()
        : await window.getgo.restartLocalWebRuntime());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      localWebActionRef.current = null;
      setLocalWebAction(null);
    }
  };

  const deployments = snapshot?.jobs.filter((job) => job.kind === "deploy") ?? [];
  const activeJobs = deployments.filter((job) => ["queued", "running", "paused"].includes(job.status));
  const latestJob = (component: DeploymentComponent) => deployments.find(job => job.component === component && job.target === environment);
  const selectedLogJob = logSelection === "localhost"
    ? localWeb?.lastJob
    : logSelection
      ? latestJob(logSelection)
      : undefined;
  const componentIsActive = (component: DeploymentComponent) =>
    activeJobs.some((job) => job.component === component);
  const deploymentIsActive = activeJobs.some((job) => job.operation === "deploy");
  const operationIsRunning = (component: DeploymentComponent, operation: DeploymentOperation) =>
    activeJobs.some((job) => job.status !== "paused" && job.component === component && job.operation === operation);
  const componentControlsLocked = (component: DeploymentComponent) =>
    busy === component || componentIsActive(component);
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
    <ui.PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={<ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</ui.Button>}
    />
    {error && <ui.ErrorFrame message={error} />}
    <div className="deployment-target-summary" aria-label={copy.selectedTarget}>
      <span>{copy.selectedTarget}</span>
      <strong>{environment}</strong>
      <code>{environment === "development" ? "com.tnp.getgo.webapp.dev" : environment === "staging" ? "com.tnp.getgo.webapp.staging" : "com.tnp.getgo.webapp"}</code>
      <small>{copy.targetAppliesToAll}</small>
    </div>
    <div className="deployment-grid deployment-grid-web">
      <ui.Panel className="deployment-card">
        <ui.PanelBody>
          <div className="deployment-card-icon"><MonitorCog /></div>
          <div className="deployment-card-copy">
            <div className="deployment-card-title"><h2>{copy.localhostTitle}</h2><span className={`badge local-web-state-${localWeb?.status ?? "offline"}`}>{localWeb?.status === "online" ? copy.online : localWeb?.status === "starting" ? copy.starting : localWeb?.status === "error" ? copy.failed : copy.offline}</span></div>
            <dl className="deployment-card-facts"><div><dt>{copy.localhostAddress}</dt><dd>{localWeb?.url ?? "http://localhost:5173"}</dd></div><div><dt>{copy.localhostEnvironment}</dt><dd>{copy.development}</dd></div></dl>
            {localWeb?.error && <p className="local-web-error">{localWeb.error}</p>}
          </div>
          <div className="deployment-card-actions">
            <ui.Button icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} disabled={!localWeb?.lastJob} onClick={() => setLogSelection("localhost")} />
            <ui.Button icon={<ExternalLink />} aria-label={copy.openLocalhost} title={copy.openLocalhost} disabled={localWeb?.status !== "online"} onClick={() => localWeb && void window.getgo.openExternal(localWeb.url)} />
            {localWeb?.status === "online" || localWeb?.managed
              ? <ui.Button variant="solid" icon={<RotateCw />} loading={localWebAction === "restart"} onClick={() => void controlLocalWeb("restart")}>{copy.restartLocalhost}</ui.Button>
              : <ui.Button variant="solid" icon={<Power />} loading={localWebAction === "start"} onClick={() => void controlLocalWeb("start")}>{copy.runLocalhost}</ui.Button>}
          </div>
        </ui.PanelBody>
      </ui.Panel>
      <DeploymentServiceCards locale={locale} state={deploymentState} busy={busy} deploymentIsActive={deploymentIsActive} componentControlsLocked={componentControlsLocked} operationIsRunning={operationIsRunning} onRun={run} onViewLogs={setLogSelection} hasLogs={component => Boolean(latestJob(component))} />
    </div>
    <div className="deployment-grid deployment-grid-native">
      <NativeDeploymentCards
        locale={locale}
        activeJobs={activeJobs}
        busy={busy}
        onRun={run}
        onOpen={platform => void window.getgo.openNativeProject(platform, environment)}
        onViewLogs={setLogSelection}
        hasLogs={component => Boolean(latestJob(component))}
      />
    </div>
    {activeJobs.length > 0 && <section className="deployment-jobs">
      <div><h2>{copy.activeDeployments}</h2><ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openAllJobs}</ui.Button></div>
      <BackgroundJobsTable locale={locale} ariaLabel={copy.activeDeployments} rows={activeJobs} busyJob={busyJob} emptyText={copy.noActiveDeployments} onAction={(job, action) => void control(job, action)} />
    </section>}
    {selectedLogJob && <DeploymentJobReportDrawer locale={locale} job={selectedLogJob} onClose={() => setLogSelection(null)} />}
  </section>;
}
