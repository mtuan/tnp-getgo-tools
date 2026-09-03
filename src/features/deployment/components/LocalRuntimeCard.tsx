import { ExternalLink, Eye, MonitorCog, Power, RotateCw } from "lucide-react";
import type { AppSettings, LocalWebRuntimeSnapshot } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { LastDeploymentJobStatus } from "./LastDeploymentJobStatus";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface LocalRuntimeCardProps {
  locale: AppSettings["locale"];
  runtime: LocalWebRuntimeSnapshot | null;
  action: "start" | "restart" | null;
  title: string;
  environment: string;
  onControl(action: "start" | "restart"): void;
  onViewLogs(): void;
}

export function LocalRuntimeCard({ locale, runtime, action, title, environment, onControl, onViewLogs }: LocalRuntimeCardProps) {
  const copy = (locale === "vi" ? vi : en).deployment;
  return <ui.Panel className="deployment-card">
    <ui.PanelBody>
      <div className="deployment-card-icon"><MonitorCog /></div>
      <div className="deployment-card-copy">
        <div className="deployment-card-title">
          <h2>{title}</h2>
          <span className={`badge local-web-state-${runtime?.status ?? "offline"}`}>
            {runtime?.status === "online" ? copy.online : runtime?.status === "starting" ? copy.starting : runtime?.status === "error" ? copy.failed : copy.offline}
          </span>
        </div>
        <dl className="deployment-card-facts">
          <div><dt>{copy.localhostAddress}</dt><dd>{runtime?.url ?? "—"}</dd></div>
          <div><dt>{copy.localhostEnvironment}</dt><dd>{environment}</dd></div>
        </dl>
        <LastDeploymentJobStatus job={runtime?.lastJob} locale={locale} localhost />
        {runtime?.error && <p className="local-web-error">{runtime.error}</p>}
      </div>
      <div className="deployment-card-actions">
        <ui.Button icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} disabled={!runtime?.lastJob} onClick={onViewLogs} />
        <ui.Button icon={<ExternalLink />} aria-label={copy.openLocalhost} title={copy.openLocalhost} disabled={runtime?.status !== "online"} onClick={() => runtime && void window.getgo.openExternal(runtime.url)} />
        {runtime?.status === "online" || runtime?.managed
          ? <ui.Button variant="solid" icon={<RotateCw />} loading={action === "restart"} disabled={action !== null} onClick={() => onControl("restart")}>{copy.restartLocalhost}</ui.Button>
          : <ui.Button variant="solid" icon={<Power />} loading={action === "start"} disabled={action !== null} onClick={() => onControl("start")}>{copy.runLocalhost}</ui.Button>}
      </div>
    </ui.PanelBody>
  </ui.Panel>;
}
