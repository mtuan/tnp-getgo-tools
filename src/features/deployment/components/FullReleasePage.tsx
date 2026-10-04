import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, Check, CheckCircle2, Copy, Eye, RefreshCw, Rocket, Server, Smartphone, UploadCloud } from "lucide-react";
import type { AppSettings, BackgroundJob, BackgroundJobsSnapshot, ReleaseDoctorSnapshot, WebDeploymentTarget } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { useAuth } from "../../authentication/components/AuthContext";
import { BackgroundJobsTable, type BackgroundJobAction } from "../../jobs/components/BackgroundJobsTable";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { DeploymentJobReportDrawer } from "./DeploymentJobReportDrawer";

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
  const [releaseBusy, setReleaseBusy] = useState(false);
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
      `Status: ${releaseCopy.actionRequired}`,
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
  const startRelease = async () => {
    if (!doctor?.ready || activeRelease) return;
    if (!window.confirm(releaseCopy.confirm.replace("{target}", target))) return;
    setReleaseBusy(true);
    setError(null);
    try { setSnapshot(await window.getgo.startFullRelease(target)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setReleaseBusy(false); }
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
              <ui.StatusBadge tone={check.status === "ready" ? "success" : "danger"}>{check.status === "ready" ? releaseCopy.ready : releaseCopy.actionRequired}</ui.StatusBadge>
              {check.status === "action-required" && <ui.Button className="release-doctor-copy" icon={copiedCheckId === check.id ? <Check /> : <Copy />} onClick={() => void copyDoctorError(check)}>
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
          <li><span><Server /></span><div><strong>{releaseCopy.webStep}</strong><small>{releaseCopy.webStepDescription}</small></div></li>
          <li><span><UploadCloud /></span><div><strong>{releaseCopy.iosStep}</strong><small>{releaseCopy.iosStepDescription}</small></div></li>
          <li><span><Smartphone /></span><div><strong>{releaseCopy.androidStep}</strong><small>{target === "staging" ? releaseCopy.androidStagingDescription : releaseCopy.androidProductionDescription}</small></div></li>
        </ol>
        {activeRelease && <div className="release-active-status" role="status">
          <div><strong>{releaseCopy.releaseRunning}</strong><span>{activeRelease.progressLabel}</span></div>
          <span>{activeRelease.completed}/{activeRelease.total}</span>
          <ui.Button variant="icon" icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} onClick={() => setSelectedJobId(activeRelease.id)} />
        </div>}
        <div className="release-primary-action">
          <div>
            <strong>{doctor?.ready ? releaseCopy.allReady : releaseCopy.notReady}</strong>
            <p>{doctor?.ready ? releaseCopy.readyDescription : releaseCopy.notReadyDescription}</p>
          </div>
          <ui.Button variant="solid" icon={<Rocket />} loading={releaseBusy || Boolean(activeRelease)} disabled={!doctor?.ready || doctorBusy || Boolean(activeRelease)} onClick={() => requireAuth(startRelease)}>
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
