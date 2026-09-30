import { Apple, Cable, ExternalLink, Eye, PackageCheck, Play, Smartphone, Tag, UploadCloud } from "lucide-react";
import type { AppSettings, BackgroundJob, DeploymentComponent, DeploymentOperation, IosSigningState, NativeVersionState } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import { LastDeploymentJobStatus } from "./LastDeploymentJobStatus";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

interface NativeDeploymentCardsProps {
  locale: AppSettings["locale"];
  activeJobs: BackgroundJob[];
  onRun(operation: DeploymentOperation, component: DeploymentComponent): void;
  onOpen(platform: "ios" | "android"): void;
  onViewLogs(component: DeploymentComponent): void;
  latestJob(component: DeploymentComponent): BackgroundJob | undefined;
  iosSigning?: IosSigningState;
  product?: "web" | "app";
  runOnly?: boolean;
  nativeVersion?: NativeVersionState;
  versionBusy?: boolean;
  onUpdateVersion?(increment: "patch" | "minor" | "major"): void;
}

export function NativeDeploymentCards({ locale, activeJobs, onRun, onOpen, onViewLogs, latestJob, iosSigning, product = "web", runOnly = false, nativeVersion, versionBusy = false, onUpdateVersion }: NativeDeploymentCardsProps) {
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
              {isIos && !runOnly && <div>
                <dt>{copy.iosSigning}</dt>
                <dd>
                  <ui.StatusBadge
                    tone={!iosSigning ? "neutral" : iosSigning.style === "automatic" ? "info" : iosSigning.configured ? "primary" : "danger"}
                    title={iosSigning?.provisioningProfile}
                  >
                    {!iosSigning ? copy.iosSigningLoading : iosSigning.style === "automatic" ? copy.iosSigningAutomatic : iosSigning.style === "invalid" ? copy.iosSigningInvalid : iosSigning.configured ? copy.iosSigningManual : copy.iosSigningIncomplete}
                  </ui.StatusBadge>
                </dd>
              </div>}
            </dl>
            <LastDeploymentJobStatus job={latestJob(component)} locale={locale} />
            {active?.progressLabel && <p className="deployment-active-progress">{active.progressLabel}</p>}
          </div>
          <div className="deployment-card-actions">
            <ui.Button icon={<Eye />} aria-label={copy.viewLogs} title={copy.viewLogs} disabled={!latestJob(component)} onClick={() => onViewLogs(component)} />
            {!runOnly && <ui.Button icon={<ExternalLink />} aria-label={copy.openNativeProject} title={copy.openNativeProject} disabled={Boolean(active)} onClick={() => onOpen(platform)} />}
            <ui.Button icon={<Play />} loading={active?.operation === "run"} disabled={Boolean(active)} onClick={() => onRun("run", component)}>{isIos ? copy.iosSimulator : copy.androidEmulator}</ui.Button>
            {!runOnly && <ui.Button icon={<Cable />} loading={active?.operation === "run-device"} disabled={Boolean(active)} onClick={() => onRun("run-device", component)}>{copy.usb}</ui.Button>}
            {!runOnly && <ui.Button variant="solid" icon={isIos ? <UploadCloud /> : <PackageCheck />} loading={active?.operation === "deploy"} disabled={Boolean(active)} onClick={() => onRun("deploy", component)}>{isIos ? copy.deployTestFlight : copy.deployPlay}</ui.Button>}
          </div>
        </ui.PanelBody>
      </ui.Panel>
    );
  };
  return <>
    {!runOnly && <ui.Panel className="native-version-panel">
      <ui.PanelBody>
        <div className="native-version-heading">
          <span className="deployment-card-icon"><Tag /></span>
          <div>
            <h2>{copy.nativeVersion}</h2>
            <p>{copy.nativeVersionDescription}</p>
          </div>
          <strong>{nativeVersion?.version ?? copy.nativeVersionLoading}</strong>
        </div>
        <div className="native-version-actions">
          <ui.Button disabled={!nativeVersion || versionBusy || activeJobs.length > 0} onClick={() => onUpdateVersion?.("patch")}>{copy.versionPatch} · {nativeVersion?.next.patch ?? "—"}</ui.Button>
          <ui.Button disabled={!nativeVersion || versionBusy || activeJobs.length > 0} onClick={() => onUpdateVersion?.("minor")}>{copy.versionMinor} · {nativeVersion?.next.minor ?? "—"}</ui.Button>
          <ui.Button disabled={!nativeVersion || versionBusy || activeJobs.length > 0} onClick={() => onUpdateVersion?.("major")}>{copy.versionMajor} · {nativeVersion?.next.major ?? "—"}</ui.Button>
        </div>
      </ui.PanelBody>
    </ui.Panel>}
    {renderCard("ios")}{renderCard("android")}
  </>;
}
