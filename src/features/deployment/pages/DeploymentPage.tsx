import { useCallback, useEffect, useRef, useState } from "react";
import { BriefcaseBusiness } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, DeploymentComponent, DeploymentOperation, DeploymentProduct, DeploymentStateSnapshot, LocalWebRuntimeSnapshot } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { BackgroundJobsTable, type BackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";
import { DeploymentServiceCards } from "../components/DeploymentServiceCards";
import { DeploymentJobReportDrawer } from "../components/DeploymentJobReportDrawer";
import { NativeDeploymentCards } from "../components/NativeDeploymentCards";
import { useAuth } from "../../authentication/components/AuthContext";
import { LocalRuntimeCard } from "../components/LocalRuntimeCard";
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
  const [product, setProduct] = useState<DeploymentProduct>("web");
  const [busy, setBusy] = useState<DeploymentComponent | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BackgroundJobsSnapshot | null>(null);
  const [deploymentState, setDeploymentState] = useState<DeploymentStateSnapshot | null>(null);
  const [localWeb, setLocalWeb] = useState<LocalWebRuntimeSnapshot | null>(null);
  const [localWebAction, setLocalWebAction] = useState<"start" | "restart" | null>(null);
  const localWebActionRef = useRef<"start" | "restart" | null>(null);
  const [localApp, setLocalApp] = useState<LocalWebRuntimeSnapshot | null>(null);
  const [localAppAction, setLocalAppAction] = useState<"start" | "restart" | null>(null);
  const localAppActionRef = useRef<"start" | "restart" | null>(null);
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
      const state = await window.getgo.getLocalWebRuntime("web");
      if (!localWebActionRef.current) setLocalWeb(state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const loadLocalApp = useCallback(async () => {
    try {
      const state = await window.getgo.getLocalWebRuntime("app");
      if (!localAppActionRef.current) setLocalApp(state);
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
  useEffect(() => {
    void loadLocalApp();
    const timer = window.setInterval(() => void loadLocalApp(), 2000);
    return () => window.clearInterval(timer);
  }, [loadLocalApp]);

  const executeRun = async (operation: DeploymentOperation, component: DeploymentComponent) => {
    const componentName = component === "web" ? copy.webTitle : component === "firebase" ? copy.rulesTitle : component === "mobile-ios" ? copy.iosTitle : copy.androidTitle;
    if (operation === "deploy" && environment === "production" && !window.confirm(copy.productionConfirm.replace("{component}", componentName))) return;
    setBusy(component);
    setError(null);
    try {
      setSnapshot(await window.getgo.startDeployment(operation, component, environment, product));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const controlLocalApp = async (action: "start" | "restart") => {
    if (localAppActionRef.current) return;
    localAppActionRef.current = action;
    setLocalAppAction(action);
    setLocalApp(current => current ? { ...current, status: "starting", error: undefined } : current);
    setError(null);
    try {
      setLocalApp(action === "start"
        ? await window.getgo.startLocalWebRuntime("app", environment)
        : await window.getgo.restartLocalWebRuntime("app", environment));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      localAppActionRef.current = null;
      setLocalAppAction(null);
    }
  };
  const run = (operation: DeploymentOperation, component: DeploymentComponent) => {
    if (operation === "deploy") requireAuth(() => executeRun(operation, component));
    else void executeRun(operation, component);
  };

  const controlLocalWeb = async (action: "start" | "restart") => {
    if (localWebActionRef.current) return;
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

  const deployments = snapshot?.jobs.filter((job) => job.kind === "deploy" && (product === "app" ? job.deploymentProduct === "app" : job.deploymentProduct !== "app")) ?? [];
  const activeJobs = deployments.filter((job) => ["queued", "running", "paused"].includes(job.status));
  const latestJob = (component: DeploymentComponent) => deployments.find(job => job.component === component && job.target === environment);
  const selectedLogJob = logSelection === "localhost"
    ? (product === "app" ? localApp?.lastJob : localWeb?.lastJob)
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
    <div className="deployment-page-heading">
      <ui.PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        actions={<ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</ui.Button>}
      />
      <ui.Tabs<DeploymentProduct>
        items={[{ id: "web", label: copy.webTab }, { id: "app", label: copy.appTab }]}
        value={product}
        onChange={value => { setProduct(value); setLogSelection(null); }}
        ariaLabel={copy.productTabs}
        variant="underline"
      />
    </div>
    {error && <ui.ErrorFrame message={error} />}
    <div className="deployment-target-summary" aria-label={copy.selectedTarget}>
      <span>{copy.selectedTarget}</span>
      <strong>{environment}</strong>
      <code>{product === "app" ? "com.tnpglobal.getgo / com.tnp.getgo" : environment === "development" ? "com.tnp.getgo.webapp.dev" : environment === "staging" ? "com.tnp.getgo.webapp.staging" : "com.tnp.getgo.webapp"}</code>
      <small>{copy.targetAppliesToAll}</small>
    </div>
    {product === "web" ? <>
      <div className="deployment-grid deployment-grid-web">
        <LocalRuntimeCard locale={locale} runtime={localWeb} action={localWebAction} title={copy.localhostTitle} environment={copy.development} onControl={action => void controlLocalWeb(action)} onViewLogs={() => setLogSelection("localhost")} />
        <DeploymentServiceCards locale={locale} state={deploymentState} busy={busy} deploymentIsActive={deploymentIsActive} componentControlsLocked={componentControlsLocked} operationIsRunning={operationIsRunning} onRun={run} onViewLogs={setLogSelection} latestJob={latestJob} />
      </div>
      <div className="deployment-grid deployment-grid-native">
        <NativeDeploymentCards locale={locale} activeJobs={activeJobs} busy={busy} onRun={run} onOpen={platform => void window.getgo.openNativeProject(platform, environment, "web")} onViewLogs={setLogSelection} latestJob={latestJob} />
      </div>
    </> : <>
      <div className="deployment-grid deployment-grid-app">
        <LocalRuntimeCard locale={locale} runtime={localApp} action={localAppAction} title={copy.appLocalhostTitle} environment={copy.localEnvironment} onControl={action => void controlLocalApp(action)} onViewLogs={() => setLogSelection("localhost")} />
        <NativeDeploymentCards locale={locale} activeJobs={activeJobs} busy={busy} product="app" runOnly onRun={run} onOpen={() => undefined} onViewLogs={setLogSelection} latestJob={latestJob} />
      </div>
    </>}
    {activeJobs.length > 0 && <section className="deployment-jobs">
      <div><h2>{copy.activeDeployments}</h2><ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openAllJobs}</ui.Button></div>
      <BackgroundJobsTable locale={locale} ariaLabel={copy.activeDeployments} rows={activeJobs} busyJob={busyJob} emptyText={copy.noActiveDeployments} onAction={(job, action) => void control(job, action)} />
    </section>}
    {selectedLogJob && <DeploymentJobReportDrawer locale={locale} job={selectedLogJob} onClose={() => setLogSelection(null)} />}
  </section>;
}
