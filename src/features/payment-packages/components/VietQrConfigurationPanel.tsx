import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Power, Settings2, ShieldCheck } from "lucide-react";
import type { AppSettings, VietQrConfigurationInput, VietQrRuntimeStatus } from "../../../shared/domain/models";
import { useAuth } from "../../authentication/components/AuthContext";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

const emptyConfiguration = (): VietQrConfigurationInput => ({
  apiBaseUrl: "",
  apiUsername: "",
  apiPassword: "",
  bankCode: "",
  bankAccount: "",
  userBankName: "",
  callbackUsername: "",
  callbackPassword: "",
  callbackSigningKey: "",
});

export function VietQrConfigurationPanel({ locale, environment }: { locale: AppSettings["locale"]; environment: AppSettings["environment"] }) {
  const copy = (locale === "vi" ? vi : en).payments.vietqr;
  const environmentLabel = (locale === "vi" ? vi : en).payments.environments[environment];
  const auth = useAuth();
  const toast = ui.useToast();
  const [status, setStatus] = useState<VietQrRuntimeStatus | null>(null);
  const [draft, setDraft] = useState<VietQrConfigurationInput | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => window.getgo.getVietQrRuntimeStatus().then(setStatus).catch(error => toast.show({ title: copy.loadFailed, description: String(error), variant: "error" }));
  useEffect(() => { void load(); }, [environment]);
  const fields = useMemo<ui.FormSchema[]>(() => [
    { type: "url", name: "apiBaseUrl", label: copy.apiBaseUrl, required: true, placeholder: "https://..." },
    [{ type: "text", name: "apiUsername", label: copy.apiUsername, required: true, autoComplete: "off" }, { type: "password", name: "apiPassword", label: copy.apiPassword, required: true, autoComplete: "new-password" }],
    [{ type: "text", name: "bankCode", label: copy.bankCode, required: true }, { type: "text", name: "bankAccount", label: copy.bankAccount, required: true }],
    { type: "text", name: "userBankName", label: copy.userBankName, required: true },
    [{ type: "text", name: "callbackUsername", label: copy.callbackUsername, required: true, autoComplete: "off" }, { type: "password", name: "callbackPassword", label: copy.callbackPassword, required: true, autoComplete: "new-password" }],
    { type: "password", name: "callbackSigningKey", label: copy.callbackSigningKey, helper: copy.callbackSigningKeyHelp, required: true, autoComplete: "new-password" },
  ], [copy]);
  const configure = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    auth.requireAuth(async () => {
      setBusy(true);
      try {
        const next = await window.getgo.configureVietQrRuntime(draft);
        setStatus(next); setDraft(null);
        toast.show({ title: copy.activated, variant: "success" });
      } catch (error) { toast.show({ title: copy.setupFailed, description: String(error), variant: "error" }); }
      finally { setBusy(false); }
    });
  };
  const disable = () => auth.requireAuth(async () => {
    if (!window.confirm(copy.disableConfirm)) return;
    setBusy(true);
    try { setStatus(await window.getgo.disableVietQrRuntime()); toast.show({ title: copy.disabled, variant: "success" }); }
    catch (error) { toast.show({ title: copy.disableFailed, description: String(error), variant: "error" }); }
    finally { setBusy(false); }
  });
  if (!status) return <ui.PageLoading label={copy.loading} />;
  return <ui.Panel title={copy.title} description={copy.description} meta={<ui.StatusBadge tone={status.enabled ? "success" : "neutral"}>{status.enabled ? copy.active : copy.inactive}</ui.StatusBadge>}>
    <ui.PanelBody>
      <div className="release-doctor-check-actions">
        <div><strong>{environmentLabel}</strong><p>{status.enabled ? copy.activeDescription : copy.inactiveDescription}</p>{status.configuredAt && <small>{copy.configuredAt.replace("{date}", new Date(status.configuredAt).toLocaleString(locale))}{status.bankAccountLast4 ? ` · •••• ${status.bankAccountLast4}` : ""}</small>}</div>
        <div className="release-remediation-actions">
          <ui.Button variant="solid" icon={<Settings2 />} disabled={busy} onClick={() => setDraft(emptyConfiguration())}>{status.configuredAt ? copy.replace : copy.setUp}</ui.Button>
          {status.enabled && <ui.Button variant="outline" color="danger" icon={<Power />} disabled={busy} onClick={disable}>{copy.disable}</ui.Button>}
        </div>
      </div>
    </ui.PanelBody>
    {draft && <ui.DialogFrame title={copy.dialogTitle} busy={busy} error={null} cancelLabel={copy.cancel} submitLabel={copy.validateAndActivate} onClose={() => !busy && setDraft(null)} onSubmit={configure}>
      <div className="release-deploy-note"><ShieldCheck size={18} /> {copy.securityNote}</div>
      <ui.Form fields={fields} values={{ ...draft }} onChange={(name, value) => setDraft(current => current ? { ...current, [name]: String(value ?? "") } : current)} />
    </ui.DialogFrame>}
  </ui.Panel>;
}
