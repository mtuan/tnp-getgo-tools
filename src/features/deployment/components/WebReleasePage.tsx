import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CircleStop, Eye, Rocket, Trash2 } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, WebDeploymentTarget, WebReleaseSummary } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { useAuth } from "../../authentication/components/AuthContext";
import { isActiveMarketplaceSyncJob } from "../../topics/domain/marketplace-sync-job";
import { DeploymentJobReportDrawer } from "./DeploymentJobReportDrawer";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

type BuildRow = { key: string; release?: WebReleaseSummary; job?: BackgroundJob; createdAt: string };
const activeStatuses = ["queued", "running", "paused"];

export function WebReleasePage({ locale, onOpenJobs }: { locale: AppSettings["locale"]; onOpenJobs(): void }) {
  const copy = (locale === "vi" ? vi : en).deployment.releaseManager;
  const { requireAuth } = useAuth();
  const [releases, setReleases] = useState<WebReleaseSummary[]>([]);
  const [jobs, setJobs] = useState<BackgroundJobsSnapshot | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [optimisticBuild, setOptimisticBuild] = useState<BackgroundJob | null>(null);
  const [busyReleaseId, setBusyReleaseId] = useState<string | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
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
    const pendingRows = releaseJobs.filter(job => job.operation === "build" && !job.releaseId).map(job => ({ key: job.id, job, createdAt: job.createdAt }));
    return [...pendingRows, ...releaseRows].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }, [releaseJobs, releases]);
  const selectedJob = selectedJobId ? releaseJobs.find(job => job.id === selectedJobId) ?? null : null;
  const failedBuildCount = releaseJobs.filter(job => job.operation === "build" && job.status === "failed").length;

  const waitForContentRestore = async (releaseId: string) => {
    let snapshot = await window.getgo.restoreWebReleaseContent(releaseId);
    let contentJob = snapshot.jobs.find(isActiveMarketplaceSyncJob);
    while (contentJob) {
      await new Promise(resolve => window.setTimeout(resolve, 500));
      snapshot = await window.getgo.getBackgroundJobs();
      const settled = snapshot.jobs.find(job => job.id === contentJob?.id);
      if (settled && ["failed", "cancelled"].includes(settled.status)) throw new Error(settled.error ?? copy.contentSyncFailed);
      contentJob = snapshot.jobs.find(isActiveMarketplaceSyncJob);
    }
  };
  const build = async () => {
    if (activeJob || !window.confirm(copy.buildConfirm)) return;
    const createdAt = new Date().toISOString();
    const pending: BackgroundJob = {
      id: `pending-build-${Date.now()}`, kind: "deploy", deploymentProduct: "web", component: "release", operation: "build", target: "staging",
      name: copy.pendingBuild, description: copy.buildQueued, status: "queued", completed: 0, total: 12, progressLabel: copy.buildQueued,
      createdAt, cancellable: false, retryable: false, logs: [{ timestamp: createdAt, stream: "system", message: copy.buildQueued }],
    };
    setOptimisticBuild(pending);
    setBuilding(true); setError(null);
    try {
      setJobs(await window.getgo.startWebBuild());
      setOptimisticBuild(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setOptimisticBuild({ ...pending, status: "failed", error: message, progressLabel: copy.buildStartFailed, finishedAt: new Date().toISOString(), logs: [...(pending.logs ?? []), { timestamp: new Date().toISOString(), stream: "stderr", message }] });
      setError(message);
    }
    finally { setBuilding(false); }
  };
  const activate = async (release: WebReleaseSummary, target: Exclude<WebDeploymentTarget, "development">) => {
    if (activeJob || !window.confirm(copy.activateConfirm.replace("{release}", release.releaseId).replace("{target}", target))) return;
    setBusyReleaseId(release.releaseId); setError(null);
    try { await waitForContentRestore(release.releaseId); setJobs(await window.getgo.activateWebRelease(target, release.releaseId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyReleaseId(null); }
  };
  const cancelBuild = async (job: BackgroundJob) => {
    if (!activeStatuses.includes(job.status) || !window.confirm(copy.cancelConfirm)) return;
    setBusyJobId(job.id); setError(null);
    try { setJobs(await window.getgo.cancelBackgroundJob(job.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyJobId(null); }
  };
  const deleteBuild = async (row: BuildRow) => {
    if (row.release?.activeStaging || row.release?.activeProduction || (row.job && activeStatuses.includes(row.job.status))) return;
    const name = row.release?.releaseId ?? row.job?.name ?? copy.pendingBuild;
    if (!window.confirm(copy.deleteBuildConfirm.replace("{build}", name))) return;
    const busyId = row.job?.id ?? row.release?.releaseId ?? row.key;
    setBusyJobId(busyId); setError(null); setSelectedJobId(null);
    try {
      if (row.release) setReleases(await window.getgo.deleteWebRelease(row.release.releaseId));
      if (row.job?.id.startsWith("pending-build-")) setOptimisticBuild(null);
      else if (row.job) setJobs(await window.getgo.deleteBackgroundJob(row.job.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyJobId(null); }
  };
  const clearFailedBuilds = async () => {
    if (!failedBuildCount || !window.confirm(copy.clearFailedConfirm.replace("{count}", String(failedBuildCount)))) return;
    setClearingFailed(true); setError(null); setSelectedJobId(null);
    try {
      setOptimisticBuild(current => current?.status === "failed" ? null : current);
      setJobs(await window.getgo.clearFailedWebBuilds());
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setClearingFailed(false); }
  };

  const columns: ui.DataColumn<BuildRow>[] = [
    { key: "build", title: copy.buildColumn, width: 230, sortValue: row => row.release?.releaseId ?? row.createdAt, render: row => <div className="deployment-report-step release-build-identity"><strong>{row.release?.releaseId ?? copy.pendingBuild}</strong><small>{row.release ? row.release.gitCommit.slice(0, 10) : row.job?.id.slice(0, 8)}</small></div> },
    { key: "notes", title: copy.notesColumn, render: row => { const percent = row.job ? Math.round((row.job.completed / Math.max(1, row.job.total)) * 100) : 100; return <div className="release-build-notes"><strong title={row.job?.progressLabel ?? copy.artifactReady}>{row.job?.progressLabel ?? copy.artifactReady}</strong>{row.job && <div className="release-build-progress"><div role="progressbar" aria-label={copy.progress} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div><small>{percent}% · {copy.tasks.replace("{completed}", String(row.job.completed)).replace("{total}", String(row.job.total))}</small></div>}{row.job?.error && <small className="release-build-error" title={row.job.error}>{row.job.error}</small>}</div>; } },
    { key: "created", title: copy.createdColumn, width: 190, sortValue: row => row.createdAt, render: row => new Date(row.createdAt).toLocaleString(locale) },
    { key: "result", title: copy.resultColumn, width: 130, render: row => <ui.StatusBadge tone={row.job?.status === "failed" ? "danger" : row.job && activeStatuses.includes(row.job.status) ? "warning" : "success"}>{row.job?.status ?? copy.success}</ui.StatusBadge> },
    { key: "actions", title: copy.actionsColumn, role: "actions", width: 340, render: row => <div className="release-doctor-check-actions release-build-actions">
      {row.job && <ui.Button variant="icon" icon={<Eye />} aria-label={copy.viewResult} title={copy.viewResult} onClick={() => setSelectedJobId(row.job!.id)} />}
      {row.job && activeStatuses.includes(row.job.status) && <ui.Button variant="icon" color="danger" icon={<CircleStop />} aria-label={copy.cancelBuild} title={copy.cancelBuild} loading={busyJobId === row.job.id} disabled={!row.job.cancellable || Boolean(busyJobId)} onClick={() => requireAuth(() => cancelBuild(row.job!))} />}
      {row.release && <><ui.Button className={`release-environment-toggle ${row.release.activeStaging ? "is-active" : ""}`} variant={row.release.activeStaging ? "solid" : "outline"} color={row.release.activeStaging ? "success" : "neutral"} aria-pressed={row.release.activeStaging} disabled={Boolean(activeJob || busyReleaseId)} onClick={() => !row.release!.activeStaging && requireAuth(() => activate(row.release!, "staging"))}>{copy.staging}</ui.Button><ui.Button className={`release-environment-toggle ${row.release.activeProduction ? "is-active" : ""}`} variant={row.release.activeProduction ? "solid" : "outline"} color={row.release.activeProduction ? "success" : "neutral"} aria-pressed={row.release.activeProduction} disabled={Boolean(activeJob || busyReleaseId)} onClick={() => !row.release!.activeProduction && requireAuth(() => activate(row.release!, "production"))}>{copy.production}</ui.Button></>}
      {(row.release || (row.job && !activeStatuses.includes(row.job.status))) && <ui.Button variant="icon" color="danger" icon={<Trash2 />} aria-label={copy.deleteVersion} title={row.release?.activeStaging || row.release?.activeProduction ? copy.activeDeleteBlocked : copy.deleteVersion} loading={busyJobId === (row.job?.id ?? row.release?.releaseId)} disabled={Boolean(activeJob || busyReleaseId || busyJobId || row.release?.activeStaging || row.release?.activeProduction)} onClick={() => requireAuth(() => deleteBuild(row))} />}
    </div> },
  ];

  return <section className="deployment-page full-release-page">
    <div className="deployment-page-heading"><ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<><ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</ui.Button><ui.ActionMenu label={copy.buildActions} disabled={clearingFailed} items={[{ id: "clear-failed", label: copy.clearFailed, icon: Trash2, color: "danger", disabled: failedBuildCount === 0, onSelect: () => requireAuth(clearFailedBuilds) }]} /><ui.Button variant="solid" icon={<Rocket />} loading={building} disabled={Boolean(activeJob)} onClick={() => requireAuth(build)}>{copy.build}</ui.Button></>} /></div>
    {error && <ui.ErrorFrame message={error} />}
    {loading ? <ui.PageLoading label={copy.loading} /> : <div className="release-build-table"><ui.DataTable horizontalScroll ariaLabel={copy.tableLabel} rows={rows} columns={columns} rowKey={row => row.key} emptyText={copy.emptyDescription} defaultSort={{ key: "created", direction: "desc" }} sortLocale={locale} /></div>}
    {selectedJob && <DeploymentJobReportDrawer locale={locale} job={selectedJob} onClose={() => setSelectedJobId(null)} />}
  </section>;
}
