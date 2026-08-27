import { Apple, ExternalLink, PackageCheck, Play, Smartphone } from "lucide-react";
import type { AppSettings, BackgroundJob, DeploymentComponent, DeploymentOperation } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface NativeDeploymentCardsProps {
  locale: AppSettings["locale"];
  environment: AppSettings["environment"];
  activeJobs: BackgroundJob[];
  busy: DeploymentComponent | null;
  onRun(operation: DeploymentOperation, component: DeploymentComponent): void;
  onOpen(platform: "ios" | "android"): void;
}

export function NativeDeploymentCards({ locale, environment, activeJobs, busy, onRun, onOpen }: NativeDeploymentCardsProps) {
  const copy = (locale === "vi" ? vi : en).deployment;
  const renderCard = (platform: "ios" | "android") => {
    const component = `mobile-${platform}` as const;
    const active = activeJobs.find(job => job.component === component);
    const isIos = platform === "ios";
    return (
      <ui.Panel className="native-deployment-card" key={platform}>
        <ui.PanelBody>
          <div className="deployment-card-icon">{isIos ? <Apple /> : <Smartphone />}</div>
          <div className="deployment-card-copy">
            <div className="deployment-card-title">
              <h2>{isIos ? copy.iosTitle : copy.androidTitle}</h2>
              <span className={`badge ${active ? "local-web-state-starting" : "local-web-state-offline"}`}>
                {active ? copy.nativeRunning : copy.nativeReady}
              </span>
            </div>
            <p>{isIos ? copy.iosDescription : copy.androidDescription}</p>
            <ul>
              <li><span>{copy.nativeEnvironment}</span><code>{environment}</code><strong>{isIos ? "IPA" : "AAB"}</strong></li>
              <li><span>{copy.nativeDistribution}</span><code>{isIos ? "TestFlight / App Store" : "Play Internal / Production"}</code><strong>{active?.progressLabel ?? "—"}</strong></li>
            </ul>
          </div>
          <div className="deployment-card-actions">
            <ui.Button icon={<ExternalLink />} disabled={Boolean(active)} onClick={() => onOpen(platform)}>{copy.openNativeProject}</ui.Button>
            <ui.Button icon={<Play />} loading={active?.operation === "run"} disabled={Boolean(active)} onClick={() => onRun("run", component)}>{isIos ? copy.runIosSimulator : copy.runAndroidSimulator}</ui.Button>
            <ui.Button icon={<PackageCheck />} loading={active?.operation === "build"} disabled={Boolean(active) || busy === component} onClick={() => onRun("build", component)}>{copy.buildNative}</ui.Button>
            <ui.Button variant="solid" icon={<PackageCheck />} loading={active?.operation === "deploy"} disabled={Boolean(active)} onClick={() => onRun("deploy", component)}>{isIos ? copy.deployTestFlight : copy.deployPlay}</ui.Button>
          </div>
        </ui.PanelBody>
      </ui.Panel>
    );
  };
  return <>{renderCard("ios")}{renderCard("android")}</>;
}
