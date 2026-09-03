import { Apple, ExternalLink, Eye, PackageCheck, Play, Smartphone } from "lucide-react";
import type { AppSettings, BackgroundJob, DeploymentComponent, DeploymentOperation } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { LastDeploymentJobStatus } from "./LastDeploymentJobStatus";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface NativeDeploymentCardsProps {
  locale: AppSettings["locale"];
  activeJobs: BackgroundJob[];
  busy: DeploymentComponent | null;
  onRun(operation: DeploymentOperation, component: DeploymentComponent): void;
  onOpen(platform: "ios" | "android"): void;
  onViewLogs(component: DeploymentComponent): void;
  latestJob(component: DeploymentComponent): BackgroundJob | undefined;
  product?: "web" | "app";
  runOnly?: boolean;
}

export function NativeDeploymentCards({ locale, activeJobs, busy, onRun, onOpen, onViewLogs, latestJob, product = "web", runOnly = false }: NativeDeploymentCardsProps) {
  const copy = (locale === "vi" ? vi : en).deployment;
  const renderCard = (platform: "ios" | "android") => {
    const component = `mobile-${platform}` as const;
    const active = activeJobs.find(job => job.component === component);
    const isIos = platform === "ios";
    return (
      <ui.Panel className="deployment-card native-deployment-card" key={platform}>
        <ui.PanelBody>
          <div className="deployment-card-icon">{isIos ? <Apple /> : <Smartphone />}</div>
          <div className="deployment-card-copy">
            <div className="deployment-card-title">
              <h2>{product === "app" ? (isIos ? copy.appIosTitle : copy.appAndroidTitle) : (isIos ? copy.iosTitle : copy.androidTitle)}</h2>
              <span className={`badge ${active ? "local-web-state-starting" : "local-web-state-offline"}`}>
                {active ? copy.nativeRunning : copy.nativeReady}
              </span>
            </div>
            <dl className="deployment-card-facts">
              {runOnly
                ? <><div><dt>{copy.nativeEnvironment}</dt><dd>{copy.expoDevelopmentBuild}</dd></div><div><dt>{copy.nativePlatform}</dt><dd>{isIos ? "iOS Simulator" : "Android Emulator"}</dd></div></>
                : <><div><dt>{copy.nativeArtifact}</dt><dd>{isIos ? "IPA" : "AAB"}</dd></div><div><dt>{copy.nativeDistribution}</dt><dd>{isIos ? "TestFlight / App Store" : "Google Play"}</dd></div></>}
            </dl>
            <LastDeploymentJobStatus job={latestJob(component)} locale={locale} />
            {active?.progressLabel && <p className="deployment-active-progress">{active.progressLabel}</p>}
          </div>
          <div className="deployment-card-actions">
            <ui.Button icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} disabled={!latestJob(component)} onClick={() => onViewLogs(component)} />
            {!runOnly && <ui.Button icon={<ExternalLink />} aria-label={copy.openNativeProject} title={copy.openNativeProject} disabled={Boolean(active)} onClick={() => onOpen(platform)} />}
            <ui.Button icon={<Play />} loading={active?.operation === "run"} disabled={Boolean(active)} onClick={() => onRun("run", component)}>{isIos ? copy.runIosSimulator : copy.runAndroidSimulator}</ui.Button>
            {!runOnly && <ui.Button icon={<PackageCheck />} loading={active?.operation === "build"} disabled={Boolean(active) || busy === component} onClick={() => onRun("build", component)}>{copy.buildNative}</ui.Button>}
            {!runOnly && <ui.Button variant="solid" icon={<PackageCheck />} loading={active?.operation === "deploy"} disabled={Boolean(active)} onClick={() => onRun("deploy", component)}>{isIos ? copy.deployTestFlight : copy.deployPlay}</ui.Button>}
          </div>
        </ui.PanelBody>
      </ui.Panel>
    );
  };
  return <>{renderCard("ios")}{renderCard("android")}</>;
}
