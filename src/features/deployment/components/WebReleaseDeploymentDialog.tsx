import { AlertTriangle, Check, CheckCircle2, Copy, RefreshCw, Rocket, Settings2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AppSettings, WebDeploymentTarget, WebReleaseReadiness, WebReleaseSummary } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

type ReleaseTarget = Exclude<WebDeploymentTarget, "development">;
type Remediation = { id: string; problem: string; fix: string; command?: string; action?: ReactNode };

interface Props {
  locale: AppSettings["locale"];
  release: WebReleaseSummary;
  target: ReleaseTarget;
  readiness: WebReleaseReadiness | null;
  error: string | null;
  busy: boolean;
  configurationBusy: boolean;
  onClose(): void;
  onRefresh(): void;
  onConfigureApple(): void;
  onCreateBuild(): void;
  onDeployToStaging(): void;
  onDeploy(bypassChecklist: boolean): void;
}

export function WebReleaseDeploymentDialog(props: Props) {
  const [copiedFix, setCopiedFix] = useState<string | null>(null);
  const copy = (props.locale === "vi" ? vi : en).deployment.releaseManager;
  const targetLabel = props.target === "staging" ? copy.staging : copy.production;
  const copyManualFix = async (id: string, command: string) => {
    await window.getgo.copyText(command);
    setCopiedFix(id);
    window.setTimeout(() => setCopiedFix(current => current === id ? null : current), 1800);
  };
  const firebaseProject = (check: WebReleaseReadiness["checks"][number]) => check.details
    .find(detail => /^(?:Required )?Firebase project:/.test(detail))
    ?.replace(/^(?:Required )?Firebase project:\s*/, "") ?? props.target;
  const manualCommand = (check: WebReleaseReadiness["checks"][number], fallback: string) =>
    check.details.find(detail => detail.startsWith("$ "))?.slice(2) ?? fallback;
  const remediation = (check: WebReleaseReadiness["checks"][number]): Remediation[] => {
    if (check.id === "artifact") return [{
      id: "artifact", problem: copy.artifactProblem, fix: copy.artifactFix,
      action: <ui.Button variant="outline" icon={<Rocket />} disabled={props.busy} onClick={props.onCreateBuild}>{copy.createBuild}</ui.Button>,
    }];
    if (check.id === "staging") return [{
      id: "staging", problem: copy.stagingProblem, fix: copy.stagingFix,
      action: <ui.Button variant="solid" color="warning" icon={<Rocket />} disabled={props.busy} onClick={props.onDeployToStaging}>{copy.deployToStaging}</ui.Button>,
    }];
    const details = check.details.join(" ");
    const project = firebaseProject(check);
    const fixes: Remediation[] = [];
    if (details.includes("GETGO_APPLE_IAP_CONFIG")) fixes.push({
      id: "apple", problem: copy.appleProblem, fix: copy.appleFix.replace("{project}", project),
      command: `printf '%s' '{"bundleId":"com.tnpglobal.getgo","appAppleId":6776639420}' | npm exec -- firebase functions:secrets:set GETGO_APPLE_IAP_CONFIG --project ${project} --data-file=- --format=json`,
      action: <ui.Button variant="solid" color="warning" icon={<Settings2 />} loading={props.configurationBusy} disabled={props.busy} onClick={props.onConfigureApple}>{copy.setUp}</ui.Button>,
    });
    if (details.includes("GETGO_VIETQR_CONFIG")) fixes.push({
      id: "vietqr", problem: copy.bankProblem, fix: copy.bankFix.replace("{project}", project),
      command: `npm exec -- firebase functions:secrets:set GETGO_VIETQR_CONFIG --project ${project}`,
    });
    if (/authentication is required/i.test(check.summary)) fixes.push({
      id: "firebase-login", problem: copy.firebaseLoginProblem, fix: copy.firebaseLoginFix,
      command: "npm exec -- firebase login",
    });
    if (/cannot access/i.test(check.summary)) fixes.push({
      id: "firebase-access", problem: copy.firebaseAccessProblem.replace("{project}", project), fix: copy.firebaseAccessFix,
      command: "npm exec -- firebase login --reauth",
    });
    if (!fixes.length) fixes.push({
      id: "environment", problem: check.summary || copy.environmentProblem,
      fix: copy.environmentFix,
      command: manualCommand(check, `npm exec -- firebase projects:list --json`),
    });
    return fixes;
  };
  const environmentSummary = (check: WebReleaseReadiness["checks"][number]) => {
    if (check.status === "ready") return copy.environmentReadySummary;
    const details = check.details.join(" ");
    if (details.includes("GETGO_APPLE_IAP_CONFIG")) return copy.applePurchaseMissing;
    if (details.includes("GETGO_VIETQR_CONFIG")) return copy.bankTransferMissing;
    return check.status === "warning" ? copy.environmentWarningSummary : copy.environmentBlockedSummary;
  };
  const checkCopy = (check: WebReleaseReadiness["checks"][number]) => {
    const ready = check.status === "ready";
    if (check.id === "artifact") return {
      title: copy.artifactCheck,
      summary: ready ? copy.artifactReadySummary : copy.artifactBlockedSummary,
    };
    if (check.id === "environment") return { title: copy.environmentCheck, summary: environmentSummary(check) };
    return { title: copy.stagingCheck, summary: ready ? copy.stagingReadySummary : copy.stagingBlockedSummary };
  };
  const loading = props.readiness === null && props.error === null;

  return <ui.DialogFrame
    presentation="modal"
    className={`release-readiness-dialog${loading ? " is-loading" : ""}`}
    title={copy.deployDialogTitle}
    busy={props.busy}
    error={props.error}
    cancelLabel={copy.cancel}
    submitLabel={copy.deployAction.replace("{target}", targetLabel)}
    submitColor="primary"
    submitDisabled={!props.readiness?.ready}
    hideFooter={loading || props.readiness === null}
    leadingAction={props.target === "staging" && props.readiness && !props.readiness.ready
      ? <ui.Button variant="solid" color="warning" icon={<AlertTriangle />} disabled={props.busy} onClick={() => props.onDeploy(true)}>{copy.deployAnyway}</ui.Button>
      : undefined}
    onClose={props.onClose}
    onSubmit={event => { event.preventDefault(); props.onDeploy(false); }}
  >
    {loading
      ? <ui.PageLoading className="release-readiness-loading" label={copy.checkingChecklist} />
      : props.readiness
        ? <>
          <div className="release-target-summary">
            <div><span>{copy.deployBuildLabel}</span><strong>{props.release.releaseId}</strong></div>
            <ui.StatusBadge tone="warning">{targetLabel}</ui.StatusBadge>
          </div>
          <section className="release-readiness">
            <div className="release-readiness-heading">
              <div><h3>{copy.checklistTitle}</h3><p>{props.target === "staging" ? copy.stagingChecklistDescription : copy.productionChecklistDescription}</p></div>
              <ui.Button variant="icon" icon={<RefreshCw />} aria-label={copy.checkAgain} title={copy.checkAgain} onClick={props.onRefresh} />
            </div>
            <div className="release-readiness-list">{props.readiness.checks.map(check => {
          const ready = check.status === "ready";
          const text = checkCopy(check);
          return <article className={`release-readiness-item release-doctor-check-${check.status}`} key={check.id}>
            <span className="release-doctor-icon" aria-hidden="true">{ready ? <CheckCircle2 /> : <AlertTriangle />}</span>
            <div className="release-readiness-content"><h3>{text.title}</h3>{ready
              ? <p>{text.summary}</p>
              : <div className="release-remediation-list">{remediation(check).map(item => <div className="release-remediation" key={item.id}>
                <p><strong>{copy.problemLabel}</strong> {item.problem}</p>
                <p><strong>{copy.fixLabel}</strong> {item.fix}</p>
                <div className="release-remediation-actions">
                  {item.action}
                  {item.command && <ui.Button variant="outline" icon={copiedFix === item.id ? <Check /> : <Copy />} onClick={() => void copyManualFix(item.id, item.command!)}>{copiedFix === item.id ? copy.copied : copy.copyManualFix}</ui.Button>}
                </div>
              </div>)}</div>}
            </div>
            {ready
              ? <ui.StatusBadge tone="success">{copy.ready}</ui.StatusBadge>
              : null}
          </article>;
            })}</div>
          </section>
          <p className="release-deploy-note">{copy.deploySummary}</p>
        </>
        : <div className="release-readiness-load-error"><ui.Button variant="solid" icon={<RefreshCw />} onClick={props.onRefresh}>{copy.checkAgain}</ui.Button></div>}
  </ui.DialogFrame>;
}
