import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, Check, CheckCircle2, Copy, ExternalLink, Eye, RefreshCw, Rocket, Server, Smartphone, UploadCloud } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, ReleaseDoctorSnapshot, ReleaseScope, WebDeploymentTarget } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { useAuth } from "../../authentication/components/AuthContext";
import { BackgroundJobsTable, type BackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { DeploymentJobReportDrawer } from "./DeploymentJobReportDrawer";
import { ReleaseStageStatus } from "./ReleaseStageStatus";

type ReleaseTarget = Exclude<WebDeploymentTarget, "development">;

export function FullReleasePage({ locale, target, onOpenJobs }: {
  locale: AppSettings["locale"];
  target: ReleaseTarget;
  onOpenJobs(): void;
}) {
  const copy = (locale === "vi" ? vi : en).deployment;
  const releaseCopy = copy.release;
  const { requireAuth } = useAuth();
  const [doctor, setDoctor] = useState<ReleaseDoctorSnapshot | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [releaseBusy, setReleaseBusy] = useState<ReleaseScope | null>(null);
  const [snapshot, setSnapshot] = useState<BackgroundJobsSnapshot | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [copiedCheckId, setCopiedCheckId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try { setSnapshot(await window.getgo.getBackgroundJobs()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }, []);

  const runDoctor = useCallback(async () => {
    setDoctorBusy(true);
    setCopiedCheckId(null);
    setError(null);
    try { setDoctor(await window.getgo.runReleaseDoctor(target)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setDoctorBusy(false); }
  }, [target]);

  const copyDoctorError = async (check: ReleaseDoctorSnapshot["checks"][number]) => {
    if (!doctor) return;
    const diagnostic = [
      "GetGo Release Doctor",
      `Target: ${doctor.target}`,
      `Checked at: ${doctor.checkedAt}`,
      `Check: ${check.title}`,
      `Status: ${check.status === "warning" ? releaseCopy.warning : releaseCopy.actionRequired}`,
      "",
      check.summary,
      ...(check.details.length > 0 ? ["", "Technical details:", ...check.details] : []),
    ].join("\n");
    try {
      await window.getgo.copyText(diagnostic);
      setCopiedCheckId(check.id);
      window.setTimeout(() => setCopiedCheckId(current => current === check.id ? null : current), 2000);
    } catch (cause) {
      setError(`${releaseCopy.copyFailed}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };

  useEffect(() => { setDoctor(null); void runDoctor(); }, [runDoctor]);
  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 500);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  const releaseJobs = snapshot?.jobs.filter(job => job.kind === "deploy" && job.component === "release" && job.target === target) ?? [];
  const activeRelease = releaseJobs.find(job => ["queued", "running", "paused"].includes(job.status));
  const selectedJob = selectedJobId ? releaseJobs.find(job => job.id === selectedJobId) ?? null : null;
  const hasDoctorWarnings = doctor?.checks.some(check => check.status === "warning") ?? false;
  const scopeReady = (scope: ReleaseScope) => {
    const required = scope === "all" ? ["web", "ios", "android"] : scope === "web" ? ["web"] : ["web", scope];
    return Boolean(doctor && doctor.checks.every(check => !required.includes(check.id) || check.status !== "action-required"));
  };
  const startRelease = async (scope: ReleaseScope) => {
    if (!scopeReady(scope) || activeRelease) return;
    const confirmation = scope === "all"
      ? releaseCopy.confirm.replace("{target}", target)
      : scope === "web"
        ? releaseCopy.webConfirm.replace("{target}", target)
        : releaseCopy.nativeConfirm.replace("{component}", scope === "ios" ? releaseCopy.iosStep : releaseCopy.androidStep).replace("{target}", target);
    if (!window.confirm(confirmation)) return;
    setReleaseBusy(scope);
    setError(null);
    try { setSnapshot(await window.getgo.startRelease(target, scope)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setReleaseBusy(null); }
  };
  const control = async (job: BackgroundJob, action: BackgroundJobAction) => {
    if (action === "cancel" && !window.confirm(copy.cancelConfirm.replace("{name}", job.name))) return;
    if (action === "delete" && !window.confirm(copy.deleteConfirm.replace("{name}", job.name))) return;
    setBusyJob(job.id);
    try {
      setSnapshot(action === "pause" ? await window.getgo.pauseBackgroundJob(job.id)
        : action === "resume" ? await window.getgo.resumeBackgroundJob(job.id)
          : action === "cancel" ? await window.getgo.cancelBackgroundJob(job.id)
            : action === "retry" ? await window.getgo.retryBackgroundJob(job.id)
              : await window.getgo.deleteBackgroundJob(job.id));
    } finally { setBusyJob(null); }
  };

  return <section className="deployment-page full-release-page">
    <div className="deployment-page-heading">
      <ui.PageHeader
        eyebrow={releaseCopy.eyebrow}
        title={releaseCopy.title.replace("{target}", target)}
        description={releaseCopy.description}
        actions={<ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openJobs}</ui.Button>}
      />
    </div>
    {error && <ui.ErrorFrame message={error} />}

    <ui.Panel className="release-doctor-panel" title={releaseCopy.doctorTitle} description={releaseCopy.doctorDescription}
      meta={<ui.Button icon={<RefreshCw />} loading={doctorBusy} onClick={() => void runDoctor()}>{releaseCopy.checkAgain}</ui.Button>}>
      <ui.PanelBody>
        {!doctor && doctorBusy ? <ui.PageLoading label={releaseCopy.checking} /> : <div className="release-doctor-checks">
          {doctor?.checks.map(check => <article className={`release-doctor-check release-doctor-check-${check.status}`} key={check.id}>
            <span className="release-doctor-icon" aria-hidden="true">{check.status === "ready" ? <CheckCircle2 /> : <AlertTriangle />}</span>
            <div><h3>{check.title}</h3><p>{check.summary}</p>
              {check.details.length > 0 && <pre className="release-doctor-details"><code>{check.details.join("\n")}</code></pre>}
            </div>
            <div className="release-doctor-check-actions">
              <ui.StatusBadge tone={check.status === "ready" ? "success" : check.status === "warning" ? "warning" : "danger"}>{check.status === "ready" ? releaseCopy.ready : check.status === "warning" ? releaseCopy.warning : releaseCopy.actionRequired}</ui.StatusBadge>
              {check.status !== "ready" && <ui.Button className="release-doctor-copy" icon={copiedCheckId === check.id ? <Check /> : <Copy />} onClick={() => void copyDoctorError(check)}>
                {copiedCheckId === check.id ? releaseCopy.copiedError : releaseCopy.copyError}
              </ui.Button>}
            </div>
          </article>)}
        </div>}
      </ui.PanelBody>
    </ui.Panel>

    <ui.Panel className="release-pipeline-panel" title={releaseCopy.pipelineTitle} description={releaseCopy.pipelineDescription}>
      <ui.PanelBody>
        <ol className="release-pipeline">
          <li><span><Server /></span><div><strong>{releaseCopy.webStep}</strong><small>{releaseCopy.webStepDescription}</small><ReleaseStageStatus stage="web" jobs={releaseJobs} locale={locale} fallbackDeployedAt={doctor?.lastDeployedAt?.web} /></div><div className="release-pipeline-actions"><ui.Button icon={<ExternalLink />} disabled={!doctor?.webUrl} onClick={() => doctor?.webUrl && void window.getgo.openExternal(doctor.webUrl)}>{copy.openWeb}</ui.Button><ui.Button variant="solid" icon={<Rocket />} loading={releaseBusy === "web"} disabled={!scopeReady("web") || Boolean(activeRelease)} onClick={() => requireAuth(() => startRelease("web"))}>{releaseCopy.deployWeb}</ui.Button></div></li>
          <li><span><UploadCloud /></span><div><strong>{releaseCopy.iosStep}</strong><small>{releaseCopy.iosStepDescription}</small><ReleaseStageStatus stage="ios" jobs={releaseJobs} locale={locale} /></div><ui.Button variant="solid" icon={<Rocket />} loading={releaseBusy === "ios"} disabled={!scopeReady("ios") || Boolean(activeRelease)} onClick={() => requireAuth(() => startRelease("ios"))}>{releaseCopy.deployIos}</ui.Button></li>
          <li><span><Smartphone /></span><div><strong>{releaseCopy.androidStep}</strong><small>{target === "staging" ? releaseCopy.androidStagingDescription : releaseCopy.androidProductionDescription}</small><ReleaseStageStatus stage="android" jobs={releaseJobs} locale={locale} /></div><ui.Button variant="solid" icon={<Rocket />} loading={releaseBusy === "android"} disabled={!scopeReady("android") || Boolean(activeRelease)} onClick={() => requireAuth(() => startRelease("android"))}>{releaseCopy.deployAndroid}</ui.Button></li>
        </ol>
        {activeRelease && <div className="release-active-status" role="status">
          <div><strong>{releaseCopy.releaseRunning}</strong><span>{activeRelease.progressLabel}</span></div>
          <span>{activeRelease.completed}/{activeRelease.total}</span>
          <ui.Button variant="icon" icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} onClick={() => setSelectedJobId(activeRelease.id)} />
        </div>}
        <div className="release-primary-action">
          <div>
            <strong>{doctor?.ready ? hasDoctorWarnings ? releaseCopy.readyWithWarnings : releaseCopy.allReady : releaseCopy.notReady}</strong>
            <p>{doctor?.ready ? hasDoctorWarnings ? releaseCopy.warningDescription : releaseCopy.readyDescription : releaseCopy.notReadyDescription}</p>
          </div>
          <ui.Button variant="solid" icon={<Rocket />} loading={releaseBusy === "all" || Boolean(activeRelease)} disabled={!doctor?.ready || doctorBusy || Boolean(activeRelease)} onClick={() => requireAuth(() => startRelease("all"))}>
            {releaseCopy.releaseButton.replace("{target}", target)}
          </ui.Button>
        </div>
      </ui.PanelBody>
    </ui.Panel>

    <section className="deployment-jobs">
      <div><h2>{releaseCopy.historyTitle}</h2><ui.Button icon={<BriefcaseBusiness />} onClick={onOpenJobs}>{copy.openAllJobs}</ui.Button></div>
      <BackgroundJobsTable locale={locale} ariaLabel={releaseCopy.historyTitle} rows={releaseJobs} busyJob={busyJob} emptyText={releaseCopy.noReleases} onAction={(job, action) => void control(job, action)} />
    </section>
    {selectedJob && <DeploymentJobReportDrawer locale={locale} job={selectedJob} onClose={() => setSelectedJobId(null)} />}
  </section>;
}
