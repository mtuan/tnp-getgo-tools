import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { AppSettings, SafeWordDictionary } from "../../../shared/domain/models";
import * as ui from "../../../shared/ui";

const lines = (value: unknown) => String(value ?? "").split(/\r?\n|,/u).map(item => item.trim()).filter(Boolean);

export function ContentSafetyPage({ locale }: { locale: AppSettings["locale"] }) {
  const isVi = locale === "vi";
  const toast = ui.useToast();
  const [persisted, setPersisted] = useState<SafeWordDictionary | null>(null);
  const [draft, setDraft] = useState<SafeWordDictionary | null>(null);
  const [saving, setSaving] = useState(false);
  const copy = isVi ? {
    eyebrow: "An toàn nội dung", title: "Từ an toàn", description: "Quản lý từ bị chặn dùng chung cho AI, lưu dữ liệu và xuất bản.",
    english: "Từ bị chặn · Tiếng Anh", vietnamese: "Từ bị chặn · Tiếng Việt", helper: "Mỗi từ hoặc cụm từ một dòng.",
    save: "Lưu từ điển", discard: "Hủy thay đổi", saved: "Đã lưu từ điển an toàn", failed: "Không thể lưu từ điển",
  } : {
    eyebrow: "Content safety", title: "Safe words", description: "Manage the shared blocked-word dictionary used by AI, local saves, and publishing.",
    english: "Blocked words · English", vietnamese: "Blocked words · Vietnamese", helper: "Enter one word or phrase per line.",
    save: "Save dictionary", discard: "Discard changes", saved: "Safety dictionary saved", failed: "Could not save dictionary",
  };
  useEffect(() => {
    void window.getgo.loadSafeWordDictionary().then(value => { setPersisted(value); setDraft(structuredClone(value)); })
      .catch(cause => toast.show({ title: copy.failed, description: cause instanceof Error ? cause.message : String(cause), variant: "error" }));
  }, []);
  const dirty = Boolean(draft && persisted && JSON.stringify(draft) !== JSON.stringify(persisted));
  const fields = useMemo<ui.FormSchema[]>(() => [[
    { type: "textarea", name: "en", label: copy.english, helper: copy.helper, autoCompact: true, maxLines: 20 },
    { type: "textarea", name: "vi", label: copy.vietnamese, helper: copy.helper, autoCompact: true, maxLines: 20 },
  ]], [copy.english, copy.helper, copy.vietnamese]);
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
        {draft ? <ui.Form fields={fields} values={{ en: draft.words.en.join("\n"), vi: draft.words.vi.join("\n") }} errors={{}} onChange={(name, value) => setDraft(current => current ? { ...current, words: { ...current.words, [name]: lines(value) } } : current)} /> : <div className="ui-panel-loading"><span className="mini-spinner" /></div>}
      </ui.PanelBody>
    </ui.Panel>
  </section>;
}
