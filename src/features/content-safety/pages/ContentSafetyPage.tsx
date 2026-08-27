import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { AppSettings, SafeWordDictionary } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";

export function ContentSafetyPage({ locale }: { locale: AppSettings["locale"] }) {
  const isVi = locale === "vi";
  const toast = ui.useToast();
  const [persisted, setPersisted] = useState<SafeWordDictionary | null>(null);
  const [draft, setDraft] = useState<SafeWordDictionary | null>(null);
  const [saving, setSaving] = useState(false);
  const copy = isVi ? {
    eyebrow: "An toàn nội dung", title: "Từ an toàn", description: "Quản lý từ bị chặn dùng chung cho AI, lưu dữ liệu và xuất bản.",
    english: "Từ bị chặn · Tiếng Anh", vietnamese: "Từ bị chặn · Tiếng Việt", helper: "Nhấn Enter hoặc dấu phẩy để thêm. Chọn một thẻ để sửa.", add: "Thêm từ hoặc cụm từ…",
    save: "Lưu từ điển", discard: "Hủy thay đổi", saved: "Đã lưu từ điển an toàn", failed: "Không thể lưu từ điển",
  } : {
    eyebrow: "Content safety", title: "Safe words", description: "Manage the shared blocked-word dictionary used by AI, local saves, and publishing.",
    english: "Blocked words · English", vietnamese: "Blocked words · Vietnamese", helper: "Press Enter or comma to add. Select a tag to edit it.", add: "Add a word or phrase…",
    save: "Save dictionary", discard: "Discard changes", saved: "Safety dictionary saved", failed: "Could not save dictionary",
  };
  const sorted = (value: SafeWordDictionary): SafeWordDictionary => ({
    ...value,
    words: {
      en: [...value.words.en].sort((left, right) => left.localeCompare(right, "en")),
      vi: [...value.words.vi].sort((left, right) => left.localeCompare(right, "vi")),
    },
  });
  useEffect(() => {
    void window.getgo.loadSafeWordDictionary().then(value => { const ordered = sorted(value); setPersisted(ordered); setDraft(structuredClone(ordered)); })
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
      toast.show({ title: copy.saved, variant: "success" });
    } catch (cause) {
      toast.show({ title: copy.failed, description: cause instanceof Error ? cause.message : String(cause), variant: "error" });
    } finally { setSaving(false); }
  };
  ui.useSaveShortcut({ enabled: dirty && !saving, onSave: () => void save() });
  return <section>
    <ui.PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} actions={<ui.ControlGroup>
      <ui.Button variant="outline" icon={<RotateCcw />} disabled={!dirty || saving} onClick={() => persisted && setDraft(structuredClone(persisted))}>{copy.discard}</ui.Button>
      <ui.Button variant="solid" color="primary" icon={<Save />} loading={saving} disabled={!dirty} onClick={save}>{copy.save}</ui.Button>
    </ui.ControlGroup>} />
    <ui.Panel title={copy.title}>
      <ui.PanelBody>
        {draft ? <ui.Form fields={fields} values={draft.words} errors={{}} onChange={(name, value) => setDraft(current => current ? { ...current, words: { ...current.words, [name]: Array.isArray(value) ? value.map(String) : [] } } : current)} /> : <div className="ui-panel-loading"><span className="mini-spinner" /></div>}
      </ui.PanelBody>
    </ui.Panel>
  </section>;
}
