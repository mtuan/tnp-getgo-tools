import { AlertTriangle, CheckCircle2, FolderCog, RefreshCw, RotateCw, XCircle } from "lucide-react";
import type { AppSettings } from "../../../shared/domain/models";
import type { StartupEnvironmentReadiness } from "../domain/startup-environment";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function StartupEnvironmentPage({
  locale,
  readiness,
  checking,
  restarting,
  onRecheck,
  onOpenConfiguration,
  onRestart,
}: {
  locale: AppSettings["locale"];
  readiness: StartupEnvironmentReadiness;
  checking: boolean;
  restarting: boolean;
  onRecheck(): void;
  onOpenConfiguration(): void;
  onRestart(): void;
}) {
  const copy = (locale === "vi" ? vi : en).startupEnvironment;
  const errors = readiness.checks.filter(check => check.status === "error").length;
  const warnings = readiness.checks.filter(check => check.status === "warning").length;
  return <main className="startup-environment-page">
    <ui.PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={<>
        <ui.Button icon={<FolderCog />} onClick={onOpenConfiguration}>{copy.openConfiguration}</ui.Button>
        <ui.Button icon={<RefreshCw />} loading={checking} disabled={checking || restarting} onClick={onRecheck}>{copy.recheck}</ui.Button>
        <ui.Button variant="solid" icon={<RotateCw />} loading={restarting} disabled={checking || restarting} onClick={onRestart}>{copy.restart}</ui.Button>
      </>}
    />
    <div className="startup-environment-summary" role="status">
      <XCircle aria-hidden="true" />
      <div><strong>{copy.summary.replace("{errors}", String(errors)).replace("{warnings}", String(warnings))}</strong><span>{copy.configurationPath}: <code>{readiness.configurationPath}</code></span></div>
    </div>
    <section className="startup-environment-checks" aria-label={copy.results}>
      {readiness.checks.map(check => {
        const Icon = check.status === "ready" ? CheckCircle2 : check.status === "warning" ? AlertTriangle : XCircle;
        return <ui.Panel key={check.id} className={`startup-environment-check startup-environment-check-${check.status}`}>
          <ui.PanelBody>
            <Icon aria-hidden="true" />
            <div>
              <div className="startup-environment-check-title">
                <strong>{check.label}</strong>
                <ui.StatusBadge tone={check.status === "ready" ? "success" : check.status === "warning" ? "warning" : "danger"}>
                  {check.status === "ready" ? copy.ready : check.status === "warning" ? copy.warning : copy.error}
                </ui.StatusBadge>
              </div>
              <p>{check.message}</p>
              {check.resolution && <small><strong>{copy.fix}:</strong> {check.resolution}</small>}
            </div>
          </ui.PanelBody>
        </ui.Panel>;
      })}
    </section>
    <p className="startup-environment-checked">{copy.checked}: {new Date(readiness.checkedAt).toLocaleString(locale)}</p>
  </main>;
}
