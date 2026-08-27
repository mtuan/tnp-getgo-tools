import { useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import type { AppSettings, SafeWordDictionary, SafeWordSyncStatus } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";

export function ContentSafetyPage({ locale }: { locale: AppSettings["locale"] }) {
  const isVi = locale === "vi";
  const toast = ui.useToast();
  const [persisted, setPersisted] = useState<SafeWordDictionary | null>(null);
  const [draft, setDraft] = useState<SafeWordDictionary | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SafeWordSyncStatus | null>(null);
  const copy = isVi ? {
    eyebrow: "An toàn nội dung", title: "Từ an toàn", description: "Quản lý từ bị chặn dùng chung cho AI, lưu dữ liệu và xuất bản.",
    english: "Từ bị chặn · Tiếng Anh", vietnamese: "Từ bị chặn · Tiếng Việt", helper: "Nhấn Enter hoặc dấu phẩy để thêm. Chọn một thẻ để sửa.", add: "Thêm từ hoặc cụm từ…",
    save: "Lưu", discard: "Hủy", saved: "Đã lưu từ điển an toàn", failed: "Không thể lưu từ điển",
    resync: "Đồng bộ lại", synced: "Đã đồng bộ mã dùng chung", syncFailed: "Không thể đồng bộ mã dùng chung", current: "Đã cập nhật",
  } : {
    eyebrow: "Content safety", title: "Safe words", description: "Manage the shared blocked-word dictionary used by AI, local saves, and publishing.",
    english: "Blocked words · English", vietnamese: "Blocked words · Vietnamese", helper: "Press Enter or comma to add. Select a tag to edit it.", add: "Add a word or phrase…",
    save: "Save", discard: "Discard", saved: "Safety dictionary saved", failed: "Could not save dictionary",
    resync: "Resync", synced: "Shared code synchronized", syncFailed: "Could not sync shared code", current: "Up to date",
  };
  const sorted = (value: SafeWordDictionary): SafeWordDictionary => ({
    ...value,
    words: {
      en: [...value.words.en].sort((left, right) => left.localeCompare(right, "en")),
      vi: [...value.words.vi].sort((left, right) => left.localeCompare(right, "vi")),
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
    { type: "multi-tag", name: "en", label: copy.english, helper: copy.helper, placeholder: copy.add },
    { type: "multi-tag", name: "vi", label: copy.vietnamese, helper: copy.helper, placeholder: copy.add },
  ]], [copy.add, copy.english, copy.helper, copy.vietnamese]);
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
        {draft ? <ui.Form fields={fields} values={draft.words} errors={{}} onChange={(name, value) => setDraft(current => current ? { ...current, words: { ...current.words, [name]: Array.isArray(value) ? value.map(String) : [] } } : current)} /> : <div className="ui-panel-loading"><span className="mini-spinner" /></div>}
      </ui.PanelBody>
    </ui.Panel>
  </section>;
}
