import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, Eye, Rocket, Trash2 } from "lucide-react";
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
  const [building, setBuilding] = useState(false);
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
      name: copy.pendingBuild, description: copy.buildQueued, status: "queued", completed: 0, total: 1, progressLabel: copy.buildQueued,
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
  const remove = async (release: WebReleaseSummary) => {
    if (release.activeStaging || release.activeProduction || activeJob || !window.confirm(copy.deleteConfirm.replace("{release}", release.releaseId))) return;
    setBusyReleaseId(release.releaseId); setError(null);
    try { setReleases(await window.getgo.deleteWebRelease(release.releaseId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusyReleaseId(null); }
  };

  const columns: ui.DataColumn<BuildRow>[] = [
    { key: "build", title: copy.buildColumn, width: "24%", sortValue: row => row.release?.releaseId ?? row.createdAt, render: row => <div className="deployment-report-step"><strong>{row.release?.releaseId ?? copy.pendingBuild}</strong><small>{row.release ? row.release.gitCommit.slice(0, 10) : row.job?.id.slice(0, 8)}</small></div> },
    { key: "notes", title: copy.notesColumn, width: "25%", render: row => <div className="deployment-report-step"><strong>{row.job?.progressLabel ?? copy.artifactReady}</strong>{row.job && <small>{row.job.completed}/{row.job.total}</small>}{row.job?.error && <small>{row.job.error}</small>}</div> },
    { key: "created", title: copy.createdColumn, width: 170, sortValue: row => row.createdAt, render: row => new Date(row.createdAt).toLocaleString(locale) },
    { key: "result", title: copy.resultColumn, width: 130, render: row => <ui.StatusBadge tone={row.job?.status === "failed" ? "danger" : row.job && activeStatuses.includes(row.job.status) ? "warning" : "success"}>{row.job?.status ?? copy.success}</ui.StatusBadge> },
    { key: "status", title: copy.statusColumn, width: 210, render: row => row.release ? <div className="release-build-statuses">{row.release.activeStaging && <ui.StatusBadge tone="success">{copy.activeStaging}</ui.StatusBadge>}{row.release.activeProduction && <ui.StatusBadge tone="success">{copy.activeProduction}</ui.StatusBadge>}{!row.release.activeStaging && !row.release.activeProduction && <ui.StatusBadge tone="neutral">{copy.unused}</ui.StatusBadge>}</div> : <span>—</span> },
    { key: "actions", title: copy.actionsColumn, role: "actions", width: 330, render: row => <div className="release-doctor-check-actions">
      {row.job && <ui.Button variant="icon" icon={<Eye />} aria-label={copy.viewResult} title={copy.viewResult} onClick={() => setSelectedJobId(row.job!.id)} />}
      {row.release && <><ui.Button disabled={Boolean(activeJob || busyReleaseId || row.release.activeStaging)} onClick={() => requireAuth(() => activate(row.release!, "staging"))}>{row.release.activeStaging ? copy.activeStaging : copy.setStaging}</ui.Button><ui.Button variant="solid" disabled={Boolean(activeJob || busyReleaseId || row.release.activeProduction)} onClick={() => requireAuth(() => activate(row.release!, "production"))}>{row.release.activeProduction ? copy.activeProduction : copy.setProduction}</ui.Button><ui.Button variant="icon" color="danger" icon={<Trash2 />} aria-label={copy.deleteVersion} title={row.release.activeStaging || row.release.activeProduction ? copy.activeDeleteBlocked : copy.deleteVersion} loading={busyReleaseId === row.release.releaseId} disabled={Boolean(activeJob || busyReleaseId || row.release.activeStaging || row.release.activeProduction)} onClick={() => requireAuth(() => remove(row.release!))} /></>}
    </div> },
  ];

  return <section className="deployment-page full-release-page">
    <div className="deployment-page-heading"><ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<><ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</ui.Button><ui.Button variant="solid" icon={<Rocket />} loading={building} disabled={Boolean(activeJob)} onClick={() => requireAuth(build)}>{copy.build}</ui.Button></>} /></div>
    {error && <ui.ErrorFrame message={error} />}
    {loading ? <ui.PageLoading label={copy.loading} /> : <ui.DataTable horizontalScroll ariaLabel={copy.tableLabel} rows={rows} columns={columns} rowKey={row => row.key} emptyText={copy.emptyDescription} defaultSort={{ key: "created", direction: "desc" }} sortLocale={locale} />}
    {selectedJob && <DeploymentJobReportDrawer locale={locale} job={selectedJob} onClose={() => setSelectedJobId(null)} />}
  </section>;
}
