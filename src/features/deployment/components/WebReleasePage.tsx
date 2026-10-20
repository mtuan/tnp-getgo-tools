import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Rocket, Trash2 } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, WebDeploymentTarget, WebReleaseSummary } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { useAuth } from "../../authentication/components/AuthContext";
import { BackgroundJobsTable, type BackgroundJobAction, type BusyBackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

type BuildRow = { key: string; release?: WebReleaseSummary; job?: BackgroundJob; createdAt: string };
type DeploymentConfirmation = { release: WebReleaseSummary; target: Exclude<WebDeploymentTarget, "development"> };
type ReleaseTab = "builds" | "jobs";
const activeStatuses = ["queued", "running", "paused"];

export function WebReleasePage({ locale }: { locale: AppSettings["locale"] }) {
  const copy = (locale === "vi" ? vi : en).deployment.releaseManager;
  const jobsCopy = (locale === "vi" ? vi : en).jobs;
  const { requireAuth } = useAuth();
  const [releases, setReleases] = useState<WebReleaseSummary[]>([]);
  const [jobs, setJobs] = useState<BackgroundJobsSnapshot | null>(null);
  const [tab, setTab] = useState<ReleaseTab>("builds");
  const [optimisticBuild, setOptimisticBuild] = useState<BackgroundJob | null>(null);
  const [busyReleaseId, setBusyReleaseId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [busyJobAction, setBusyJobAction] = useState<BusyBackgroundJobAction>(null);
  const [building, setBuilding] = useState(false);
  const [buildDialogOpen, setBuildDialogOpen] = useState(false);
  const [buildValues, setBuildValues] = useState<ui.FormValues>({ note: "" });
  const [deploymentConfirmation, setDeploymentConfirmation] = useState<DeploymentConfirmation | null>(null);
  const [clearingFailed, setClearingFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextReleases, nextJobs] = await Promise.all([window.getgo.listWebReleases(), window.getgo.getBackgroundJobs()]);
      setReleases(nextReleases); setJobs(nextJobs); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 750);
    return () => window.clearInterval(timer);
  }, [load]);

  const releaseJobs = useMemo(() => {
    const persisted = jobs?.jobs.filter(job => job.kind === "deploy" && job.component === "release") ?? [];
    return optimisticBuild && !persisted.some(job => job.id === optimisticBuild.id) ? [optimisticBuild, ...persisted] : persisted;
  }, [jobs, optimisticBuild]);
  const activeJob = releaseJobs.find(job => activeStatuses.includes(job.status));
  const rows = useMemo<BuildRow[]>(() => {
    const releaseRows = releases.map(release => ({ key: release.releaseId, release, job: releaseJobs.find(job => job.operation === "build" && job.releaseId === release.releaseId), createdAt: release.createdAt }));
    return releaseRows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [releaseJobs, releases]);
  const failedBuildCount = releaseJobs.filter(job => job.operation === "build" && job.status === "failed").length;
  const buildFields = useMemo<ui.FormSchema[]>(() => [{ name: "note", type: "textarea", label: copy.buildNoteLabel, helper: copy.buildNoteHelper, placeholder: copy.buildNotePlaceholder, rows: 4, rules: { maxLength: 500 } }], [copy]);

  const build = async (event: FormEvent) => {
    event.preventDefault();
    if (activeJob) return;
    const note = String(buildValues.note ?? "").trim();
    const createdAt = new Date().toISOString();
    const pending: BackgroundJob = {
      id: `pending-build-${Date.now()}`, kind: "deploy", deploymentProduct: "web", component: "release", operation: "build", target: "staging",
      name: copy.pendingBuild, description: copy.buildQueued, status: "queued", completed: 0, total: 12, progressLabel: copy.buildQueued,
      createdAt, releaseNote: note || undefined, cancellable: false, retryable: false, logs: [{ timestamp: createdAt, stream: "system", message: copy.buildQueued }],
    };
    setOptimisticBuild(pending);
    setTab("jobs");
    setBuilding(true); setError(null);
    try {
      setJobs(await window.getgo.startWebBuild(note || undefined));
      setOptimisticBuild(null);
      setBuildDialogOpen(false);
      setBuildValues({ note: "" });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setOptimisticBuild({ ...pending, status: "failed", error: message, progressLabel: copy.buildStartFailed, finishedAt: new Date().toISOString(), logs: [...(pending.logs ?? []), { timestamp: new Date().toISOString(), stream: "stderr", message }] });
      setError(message);
    }
    finally { setBuilding(false); }
  };
  const activate = async (release: WebReleaseSummary, target: Exclude<WebDeploymentTarget, "development">) => {
    if (activeJob) return;
    setBusyReleaseId(release.releaseId); setError(null);
    try { setJobs(await window.getgo.activateWebRelease(target, release.releaseId)); setDeploymentConfirmation(null); setTab("jobs"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyReleaseId(null); }
  };
  const controlJob = async (job: BackgroundJob, action: BackgroundJobAction) => {
    if (action === "cancel" && !window.confirm(jobsCopy.cancelConfirm.replace("{name}", job.name))) return;
    if (action === "delete" && !window.confirm(jobsCopy.deleteConfirm.replace("{name}", job.name))) return;
    setBusyJobId(job.id); setBusyJobAction({ jobId: job.id, action }); setError(null);
    try {
      setJobs(action === "pause" ? await window.getgo.pauseBackgroundJob(job.id)
        : action === "resume" ? await window.getgo.resumeBackgroundJob(job.id)
          : action === "cancel" ? await window.getgo.cancelBackgroundJob(job.id)
            : action === "retry" ? await window.getgo.retryBackgroundJob(job.id)
              : await window.getgo.deleteBackgroundJob(job.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyJobId(null); setBusyJobAction(null); }
  };
  const deleteBuild = async (row: BuildRow) => {
    if (row.release?.activeStaging || row.release?.activeProduction || (row.job && activeStatuses.includes(row.job.status))) return;
    const name = row.release?.releaseId ?? row.job?.name ?? copy.pendingBuild;
    if (!window.confirm(copy.deleteBuildConfirm.replace("{build}", name))) return;
    const busyId = row.job?.id ?? row.release?.releaseId ?? row.key;
    setBusyJobId(busyId); setError(null);
    try {
      if (row.release) setReleases(await window.getgo.deleteWebRelease(row.release.releaseId));
      if (row.job?.id.startsWith("pending-build-")) setOptimisticBuild(null);
      else if (row.job) setJobs(await window.getgo.deleteBackgroundJob(row.job.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyJobId(null); }
  };
  const clearFailedBuilds = async () => {
    if (!failedBuildCount || !window.confirm(copy.clearFailedConfirm.replace("{count}", String(failedBuildCount)))) return;
    setClearingFailed(true); setError(null);
    try {
      setOptimisticBuild(current => current?.status === "failed" ? null : current);
      setJobs(await window.getgo.clearFailedWebBuilds());
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setClearingFailed(false); }
  };

  const columns: ui.DataColumn<BuildRow>[] = [
    { key: "build", title: copy.buildColumn, width: 230, sortValue: row => row.release?.releaseId ?? row.createdAt, render: row => <div className="deployment-report-step release-build-identity"><strong>{row.release?.releaseId ?? copy.pendingBuild}</strong><small>{row.release ? row.release.gitCommit.slice(0, 10) : row.job?.id.slice(0, 8)}</small></div> },
    { key: "notes", title: copy.notesColumn, render: row => <span className="release-build-note">{row.release?.note ?? row.job?.releaseNote ?? copy.noNote}</span> },
    { key: "created", title: copy.createdColumn, width: 190, sortValue: row => row.createdAt, render: row => new Date(row.createdAt).toLocaleString(locale) },
    { key: "result", title: copy.statusColumn, width: 300, render: row => { const percent = row.job ? Math.round((row.job.completed / Math.max(1, row.job.total)) * 100) : 100; return <div className="release-build-notes"><div className="release-build-status-heading"><strong title={row.job?.progressLabel ?? copy.artifactReady}>{row.job?.progressLabel ?? copy.artifactReady}</strong><ui.StatusBadge tone={row.job?.status === "failed" ? "danger" : row.job && activeStatuses.includes(row.job.status) ? "warning" : "success"}>{row.job?.status ?? copy.success}</ui.StatusBadge></div>{row.job && row.job.status !== "completed" && <div className="release-build-progress"><div role="progressbar" aria-label={copy.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div><small>{percent}% · {copy.tasks.replace("{completed}", String(row.job.completed)).replace("{total}", String(row.job.total))}</small></div>}{row.job?.error && <small className="release-build-error" title={row.job.error}>{row.job.error}</small>}</div>; } },
    { key: "actions", title: copy.actionsColumn, role: "actions", width: 340, render: row => <div className="release-doctor-check-actions release-build-actions">
      {row.release && <><ui.Button className={`release-environment-toggle ${row.release.activeStaging ? "is-active" : ""}`} variant={row.release.activeStaging ? "solid" : "outline"} color={row.release.activeStaging ? "success" : "neutral"} aria-pressed={row.release.activeStaging} aria-label={row.release.activeStaging ? copy.openActiveEnvironment.replace("{target}", copy.staging) : undefined} title={row.release.activeStaging ? copy.openActiveEnvironment.replace("{target}", copy.staging) : undefined} disabled={!row.release.activeStaging && Boolean(activeJob || busyReleaseId)} onClick={() => row.release!.activeStaging ? void window.getgo.openExternal(row.release!.stagingUrl) : setDeploymentConfirmation({ release: row.release!, target: "staging" })}>{copy.staging}</ui.Button><ui.Button className={`release-environment-toggle ${row.release.activeProduction ? "is-active" : ""}`} variant={row.release.activeProduction ? "solid" : "outline"} color={row.release.activeProduction ? "success" : "neutral"} aria-pressed={row.release.activeProduction} aria-label={row.release.activeProduction ? copy.openActiveEnvironment.replace("{target}", copy.production) : undefined} title={row.release.activeProduction ? copy.openActiveEnvironment.replace("{target}", copy.production) : undefined} disabled={!row.release.activeProduction && Boolean(activeJob || busyReleaseId)} onClick={() => row.release!.activeProduction ? void window.getgo.openExternal(row.release!.productionUrl) : setDeploymentConfirmation({ release: row.release!, target: "production" })}>{copy.production}</ui.Button></>}
      {(row.release || (row.job && !activeStatuses.includes(row.job.status))) && <ui.Button variant="icon" color="danger" icon={<Trash2 />} aria-label={copy.deleteVersion} title={row.release?.activeStaging || row.release?.activeProduction ? copy.activeDeleteBlocked : copy.deleteVersion} loading={busyJobId === (row.job?.id ?? row.release?.releaseId)} disabled={Boolean(row.release && (activeJob || busyReleaseId || row.release.activeStaging || row.release.activeProduction))} onClick={() => requireAuth(() => deleteBuild(row))} />}
    </div> },
  ];

  return <section className="deployment-page">
    <div className="deployment-page-heading"><ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<><ui.ActionMenu label={copy.buildActions} disabled={clearingFailed} items={[{ id: "clear-failed", label: copy.clearFailed, icon: Trash2, color: "danger", disabled: failedBuildCount === 0, onSelect: () => requireAuth(clearFailedBuilds) }]} /><ui.Button variant="solid" icon={<Rocket />} loading={building} disabled={Boolean(activeJob)} onClick={() => { setBuildValues({ note: "" }); setBuildDialogOpen(true); }}>{copy.build}</ui.Button></>} /><ui.Tabs<ReleaseTab> items={[{ id: "builds", label: copy.buildsTab }, { id: "jobs", label: copy.jobsTab }]} value={tab} onChange={setTab} ariaLabel={copy.tabsLabel} variant="underline" /></div>
    {error && <ui.ErrorFrame message={error} />}
    {loading ? <ui.PageLoading label={copy.loading} /> : <ui.TabPanels<ReleaseTab> value={tab} preserveMounted={false} items={[{ id: "builds", content: <div className="release-build-table"><ui.DataTable horizontalScroll ariaLabel={copy.tableLabel} rows={rows} columns={columns} rowKey={row => row.key} emptyText={copy.emptyDescription} defaultSort={{ key: "created", direction: "desc" }} sortLocale={locale} /></div> }, { id: "jobs", content: <BackgroundJobsTable locale={locale} ariaLabel={copy.jobsTableLabel} rows={releaseJobs} busyAction={busyJobAction} emptyText={copy.jobsEmpty} onAction={(job, action) => requireAuth(() => controlJob(job, action))} /> }]} />}
    {buildDialogOpen && <ui.DialogFrame presentation="modal" title={copy.buildDialogTitle} busy={building} error={null} cancelLabel={copy.cancel} submitLabel={copy.build} onClose={() => !building && setBuildDialogOpen(false)} onSubmit={event => requireAuth(() => build(event))}><ui.Form fields={buildFields} values={buildValues} onChange={(name, value) => setBuildValues(current => ({ ...current, [name]: value }))} /></ui.DialogFrame>}
    {deploymentConfirmation && <ui.DialogFrame presentation="modal" title={copy.deployDialogTitle} busy={busyReleaseId === deploymentConfirmation.release.releaseId} error={null} cancelLabel={copy.cancel} submitLabel={copy.deployAction.replace("{target}", deploymentConfirmation.target === "staging" ? copy.staging : copy.production)} submitColor="primary" onClose={() => !busyReleaseId && setDeploymentConfirmation(null)} onSubmit={event => { event.preventDefault(); requireAuth(() => activate(deploymentConfirmation.release, deploymentConfirmation.target)); }}><dl className="release-deploy-summary"><div><dt>{copy.deployBuildLabel}</dt><dd><strong>{deploymentConfirmation.release.releaseId}</strong><small>{deploymentConfirmation.release.gitCommit}</small></dd></div><div><dt>{copy.deployDestinationLabel}</dt><dd><ui.StatusBadge tone="warning">{deploymentConfirmation.target === "staging" ? copy.staging : copy.production}</ui.StatusBadge></dd></div><div><dt>{copy.deployIncludesLabel}</dt><dd><ul><li>{copy.deployWeb}</li><li>{copy.deployFunctions}</li><li>{copy.deployRules}</li><li>{copy.deployIndexes}</li><li>{copy.deployConfiguration}</li></ul></dd></div><div><dt>{copy.deployDataLabel}</dt><dd>{copy.deployDataUnchanged}</dd></div></dl></ui.DialogFrame>}
  </section>;
}
