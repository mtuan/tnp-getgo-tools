import { useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import type { AppSettings, SafeWordDictionary, SafeWordSyncStatus } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

export function ContentSafetyPage({ locale }: { locale: AppSettings["locale"] }) {
  const isVi = locale === "vi";
  const toast = ui.useToast();
  const [persisted, setPersisted] = useState<SafeWordDictionary | null>(null);
  const [draft, setDraft] = useState<SafeWordDictionary | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SafeWordSyncStatus | null>(null);
  const copy = (isVi ? vi : en).contentSafety;
  const sorted = (value: SafeWordDictionary): SafeWordDictionary => ({
    ...value,
    words: {
      en: [...value.words.en].sort((left, right) => left.localeCompare(right, "en")),
      vi: [...value.words.vi].sort((left, right) => left.localeCompare(right, "vi")),
    },
    allowedPhrases: {
      en: [...(value.allowedPhrases?.en ?? [])].sort((left, right) => left.localeCompare(right, "en")),
      vi: [...(value.allowedPhrases?.vi ?? [])].sort((left, right) => left.localeCompare(right, "vi")),
    },
  });
  useEffect(() => {
    void Promise.all([window.getgo.loadSafeWordDictionary(), window.getgo.getSafeWordSyncStatus()]).then(([value, status]) => {
      const ordered = sorted(value); setPersisted(ordered); setDraft(structuredClone(ordered)); setSyncStatus(status);
    })
      .catch(cause => toast.show({ title: copy.failed, description: cause instanceof Error ? cause.message : String(cause), variant: "error" }));
  }, []);
  const dirty = Boolean(draft && persisted && JSON.stringify(draft) !== JSON.stringify(persisted));
  const fields = useMemo<ui.FormSchema[]>(() => [[
    { type: "multi-tag", name: "blockedEn", label: copy.blockedEnglish, helper: copy.blockedHelper, placeholder: copy.addBlocked },
    { type: "multi-tag", name: "blockedVi", label: copy.blockedVietnamese, helper: copy.blockedHelper, placeholder: copy.addBlocked },
    { type: "multi-tag", name: "allowedEn", label: copy.allowedEnglish, helper: copy.allowedHelper, placeholder: copy.addAllowed },
    { type: "multi-tag", name: "allowedVi", label: copy.allowedVietnamese, helper: copy.allowedHelper, placeholder: copy.addAllowed },
  ]], [copy.addAllowed, copy.addBlocked, copy.allowedEnglish, copy.allowedHelper, copy.allowedVietnamese, copy.blockedEnglish, copy.blockedHelper, copy.blockedVietnamese]);
  const values = draft ? {
    blockedEn: draft.words.en,
    blockedVi: draft.words.vi,
    allowedEn: draft.allowedPhrases.en,
    allowedVi: draft.allowedPhrases.vi,
  } : {};
  const updateList = (name: string, value: unknown) => setDraft(current => {
    if (!current) return current;
    const items = Array.isArray(value) ? value.map(String) : [];
    if (name === "blockedEn" || name === "blockedVi") {
      const language = name === "blockedEn" ? "en" : "vi";
      return { ...current, words: { ...current.words, [language]: items } };
    }
    const language = name === "allowedEn" ? "en" : "vi";
    return { ...current, allowedPhrases: { ...current.allowedPhrases, [language]: items } };
  });
  const save = async () => {
    if (!draft || !dirty || saving) return;
    setSaving(true);
    try {
      const value = await window.getgo.saveSafeWordDictionary(draft);
      setPersisted(value); setDraft(structuredClone(value));
      setSyncStatus(await window.getgo.getSafeWordSyncStatus());
      toast.show({ title: copy.saved, variant: "success" });
    } catch (cause) {
      toast.show({ title: copy.failed, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally { setSaving(false); }
  };
  const sync = async () => {
    if (dirty || syncing || syncStatus?.status !== "needs-sync") return;
    setSyncing(true);
    try {
      setSyncStatus(await window.getgo.syncSafeWordDictionary());
      toast.show({ title: copy.synced, variant: "success" });
    } catch (cause) {
      toast.show({ title: copy.syncFailed, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally { setSyncing(false); }
  };
  ui.useSaveShortcut({ enabled: dirty && !saving, onSave: () => void save() });
  return <section>
    <ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<ui.ControlGroup>
      <ui.Button variant="outline" icon={<RotateCcw />} disabled={!dirty || saving} onClick={() => persisted && setDraft(structuredClone(persisted))}>{copy.discard}</ui.Button>
      <ui.Button variant="solid" color="primary" icon={<Save />} loading={saving} disabled={!dirty} onClick={save}>{copy.save}</ui.Button>
      <ui.Button variant="solid" icon={<RefreshCw />} loading={syncing} disabled={dirty || syncStatus?.status !== "needs-sync"} onClick={sync}>{syncStatus?.status === "needs-sync" ? copy.resync : copy.current}</ui.Button>
    </ui.ControlGroup>} />
    <ui.Panel title={copy.title}>
      <ui.PanelBody>
        {draft ? <ui.Form fields={fields} values={values} errors={{}} onChange={updateList} /> : <div className="ui-panel-loading"><span className="mini-spinner" /></div>}
      </ui.PanelBody>
    </ui.Panel>
  </section>;
}
