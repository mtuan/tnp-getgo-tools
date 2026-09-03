import { useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, Download, FolderCog, FolderOpen, KeyRound, RefreshCw, RotateCw, X, XCircle } from "lucide-react";
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
  preview = false,
  onClose,
}: {
  locale: AppSettings["locale"];
  readiness: StartupEnvironmentReadiness;
  checking: boolean;
  restarting: boolean;
  onRecheck(): Promise<void>;
  onOpenConfiguration(): void;
  onRestart(): void;
  preview?: boolean;
  onClose?(): void;
}) {
  const copy = (locale === "vi" ? vi : en).startupEnvironment;
  const [busyCheck, setBusyCheck] = useState<string | null>(null);
  const [secretCheck, setSecretCheck] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [restartRequired, setRestartRequired] = useState(false);
  const [previewResolved, setPreviewResolved] = useState<string[]>([]);
  const checks = readiness.checks.map(check => previewResolved.includes(check.id)
    ? { ...check, status: "ready" as const, message: copy.mockResolved, resolution: undefined, action: undefined }
    : check);
  const errors = checks.filter(check => check.status === "error").length;
  const warnings = checks.filter(check => check.status === "warning").length;
  const secretConfigurationKey = checks.find(check => check.id === secretCheck)?.configurationKey;
  const categories = ["projects", "configuration", "commands", "tools"] as const;
  async function run(checkId: string, action: "select-path" | "install") {
    setBusyCheck(checkId); setActionError(null);
    try {
      if (preview && action === "install") {
        await new Promise(resolve => window.setTimeout(resolve, 450));
        setPreviewResolved(current => [...current, checkId]);
        return;
      }
      const result = action === "select-path"
        ? await window.getgo.resolveStartupRepository(checkId, preview)
        : await window.getgo.installStartupDependency(checkId);
      if (preview && result) {
        setPreviewResolved(current => [...current, checkId]);
        return;
      }
      if (result?.requiresRestart) setRestartRequired(true);
      if (result) await onRecheck();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusyCheck(null); }
  }
  async function saveSecret(event: FormEvent) {
    event.preventDefault();
    if (!secretCheck || !secret.trim()) return;
    setBusyCheck(secretCheck); setActionError(null);
    try {
      if (preview) {
        setPreviewResolved(current => [...current, secretCheck]);
        setSecretCheck(null); setSecret("");
        return;
      }
      const result = await window.getgo.saveStartupSecret(secretCheck, secret);
      if (result.requiresRestart) setRestartRequired(true);
      setSecretCheck(null); setSecret("");
      await onRecheck();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusyCheck(null); }
  }
  return <main className="startup-environment-page">
    <ui.PageHeader
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      actions={preview ? <ui.Button icon={<X />} onClick={onClose}>{copy.closePreview}</ui.Button> : <>
        <ui.Button icon={<FolderCog />} onClick={onOpenConfiguration}>{copy.openConfiguration}</ui.Button>
        <ui.Button icon={<RefreshCw />} loading={checking} disabled={checking || restarting} onClick={() => void onRecheck()}>{copy.recheck}</ui.Button>
        <ui.Button variant="solid" icon={<RotateCw />} loading={restarting} disabled={checking || restarting} onClick={onRestart}>{copy.restart}</ui.Button>
      </>}
    />
    <div className="startup-environment-summary" role="status">
      <XCircle aria-hidden="true" />
      <div><strong>{copy.summary.replace("{errors}", String(errors)).replace("{warnings}", String(warnings))}</strong><span>{copy.configurationPath}: <code>{readiness.configurationPath}</code></span></div>
    </div>
    {restartRequired && <div className="startup-environment-restart" role="status"><RotateCw /><span>{copy.restartRequired}</span></div>}
    {actionError && <ui.ErrorFrame message={actionError} />}
    {categories.map(category => <section key={category} className="startup-environment-category" aria-label={copy.categories[category]}>
      <h2>{copy.categories[category]}</h2>
      <div className="startup-environment-checks">
      {checks.filter(check => check.category === category).map(check => {
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
              {check.action && check.status !== "ready" && <div className="startup-environment-check-action">
                {check.action === "select-path" && <ui.Button icon={<FolderOpen />} loading={busyCheck === check.id} disabled={Boolean(busyCheck)} onClick={() => void run(check.id, "select-path")}>{copy.selectPath}</ui.Button>}
                {check.action === "enter-secret" && <ui.Button icon={<KeyRound />} disabled={Boolean(busyCheck)} onClick={() => { setSecretCheck(check.id); setSecret(""); setActionError(null); }}>{copy.enterSecret}</ui.Button>}
                {check.action === "install" && <ui.Button variant="solid" icon={<Download />} loading={busyCheck === check.id} disabled={Boolean(busyCheck)} onClick={() => void run(check.id, "install")}>{copy.install}</ui.Button>}
              </div>}
            </div>
          </ui.PanelBody>
        </ui.Panel>;
      })}</div>
    </section>)}
    <p className="startup-environment-checked">{copy.checked}: {new Date(readiness.checkedAt).toLocaleString(locale)}</p>
    {secretCheck && <ui.DialogFrame presentation="modal" title={copy.secretTitle} busy={busyCheck === secretCheck} error={null} submitLabel={copy.saveSecret} submitDisabled={!secret.trim()} onClose={() => { setSecretCheck(null); setSecret(""); }} onSubmit={saveSecret}>
      <label className="startup-environment-secret"><span>{copy.secretLabel}</span>{secretConfigurationKey && <code>{secretConfigurationKey}</code>}<ui.Input autoFocus type="password" autoComplete="off" aria-label={secretConfigurationKey ?? copy.secretLabel} value={secret} onChange={event => setSecret(event.target.value)} /></label>
      <p className="form-note">{copy.secretNote}</p>
    </ui.DialogFrame>}
  </main>;
}
