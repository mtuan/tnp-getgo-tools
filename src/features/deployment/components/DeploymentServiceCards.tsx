import { ExternalLink, Eye, Globe2, Rocket, ShieldCheck } from "lucide-react";
import type { AppSettings, BackgroundJob, DeploymentComponent, DeploymentOperation, DeploymentStateSnapshot } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { LastDeploymentJobStatus } from "./LastDeploymentJobStatus";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface DeploymentServiceCardsProps {
  locale: AppSettings["locale"];
  state: DeploymentStateSnapshot | null;
  busy: DeploymentComponent | null;
  deploymentIsActive: boolean;
  componentControlsLocked(component: DeploymentComponent): boolean;
  operationIsRunning(component: DeploymentComponent, operation: DeploymentOperation): boolean;
  onRun(operation: DeploymentOperation, component: DeploymentComponent): void;
  onViewLogs(component: DeploymentComponent): void;
  latestJob(component: DeploymentComponent): BackgroundJob | undefined;
}

export function DeploymentServiceCards({
  locale,
  state,
  busy,
  deploymentIsActive,
  componentControlsLocked,
  operationIsRunning,
  onRun,
  onViewLogs,
  latestJob,
}: DeploymentServiceCardsProps) {
  const copy = (locale === "vi" ? vi : en).deployment;
  const stateCopy = (status?: string) => status === "up-to-date"
    ? copy.upToDate
    : status === "changed"
      ? copy.changesDetected
      : status === "not-deployed"
        ? copy.notDeployed
        : copy.buildRequired;
  return <>
    <ui.Panel className="deployment-card">
      <ui.PanelBody>
        <div className="deployment-card-icon"><ShieldCheck /></div>
        <div className="deployment-card-copy">
          <div className="deployment-card-title">
            <h2>{copy.rulesTitle}</h2>
            <span className={`badge deployment-state-${state?.rules.status ?? "build-required"}`}>{stateCopy(state?.rules.status)}</span>
          </div>
          <dl className="deployment-card-facts">
            <div><dt>{copy.firebaseProject}</dt><dd>{state?.firebaseProject ?? "—"}</dd></div>
            <div><dt>{copy.localVersion}</dt><dd>{state?.rules.buildVersion ?? "—"}</dd></div>
            <div><dt>{copy.deployedVersion}</dt><dd>{state?.rules.deployedVersion ?? "—"}</dd></div>
          </dl>
          <LastDeploymentJobStatus job={latestJob("firebase")} locale={locale} />
        </div>
        <div className="deployment-card-actions">
          <ui.Button icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} disabled={!latestJob("firebase")} onClick={() => onViewLogs("firebase")} />
          <ui.Button icon={<ExternalLink />} aria-label={copy.openFirebase} title={copy.openFirebase} disabled={!state?.firebaseConsoleUrl} onClick={() => state && void window.getgo.openExternal(state.firebaseConsoleUrl)} />
          <ui.Button icon={<Rocket />} loading={busy === "firebase" || operationIsRunning("firebase", "build")} disabled={componentControlsLocked("firebase")} onClick={() => onRun("build", "firebase")}>{copy.buildLocal}</ui.Button>
          <ui.Button variant="solid" icon={<Rocket />} loading={operationIsRunning("firebase", "deploy")} disabled={componentControlsLocked("firebase") || deploymentIsActive || !state?.rules.builtAt || state.rules.status === "up-to-date"} onClick={() => onRun("deploy", "firebase")}>{copy.deployRules}</ui.Button>
        </div>
      </ui.PanelBody>
    </ui.Panel>

    <ui.Panel className="deployment-card">
      <ui.PanelBody>
        <div className="deployment-card-icon"><Globe2 /></div>
        <div className="deployment-card-copy">
          <div className="deployment-card-title">
            <h2>{copy.webTitle}</h2>
            <span className={`badge deployment-state-${state?.web.status ?? "build-required"}`}>{stateCopy(state?.web.status)}</span>
          </div>
          <dl className="deployment-card-facts">
            <div><dt>{copy.hostingTarget}</dt><dd>{state?.target ?? "—"}</dd></div>
            <div><dt>{copy.localVersion}</dt><dd>{state?.web.buildVersion ?? "—"}</dd></div>
            <div><dt>{copy.deployedVersion}</dt><dd>{state?.web.deployedVersion ?? "—"}</dd></div>
          </dl>
          <LastDeploymentJobStatus job={latestJob("web")} locale={locale} />
        </div>
        <div className="deployment-card-actions">
          <ui.Button icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} disabled={!latestJob("web")} onClick={() => onViewLogs("web")} />
          <ui.Button icon={<ExternalLink />} aria-label={copy.openWeb} title={copy.openWeb} disabled={!state?.webUrl} onClick={() => state && void window.getgo.openExternal(state.webUrl)} />
          <ui.Button icon={<Rocket />} loading={busy === "web" || operationIsRunning("web", "build")} disabled={componentControlsLocked("web")} onClick={() => onRun("build", "web")}>{copy.buildLocal}</ui.Button>
          <ui.Button variant="solid" icon={<Rocket />} loading={operationIsRunning("web", "deploy")} disabled={componentControlsLocked("web") || deploymentIsActive || !state?.web.builtAt || state.web.status === "up-to-date"} onClick={() => onRun("deploy", "web")}>{copy.deployWeb}</ui.Button>
        </div>
      </ui.PanelBody>
    </ui.Panel>
  </>;
}
