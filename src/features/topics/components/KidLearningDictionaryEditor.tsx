import { useEffect, useMemo, useState } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import type { KidLearningDictionary, KidLearningDictionaryEntry } from "../../../shared/domain/models";
import { Button } from "../../../shared/ui/Button";
import { DataTable, type DataColumn } from "../../../shared/ui/DataTable";
import { Form, type FormSchema } from "../../../shared/ui/Form";
import { Panel } from "../../../shared/ui/Panel";
import { useSaveShortcut } from "../../../shared/ui/useSaveShortcut";

type DictionaryRow = {
  id: string;
  image?: string;
  minimumAge: number;
  enText?: string;
  enMeaning?: string;
  enAliases?: string;
  viText?: string;
  viClassifier?: string;
  viMeaning?: string;
  viAliases?: string;
  source: KidLearningDictionaryEntry;
};

const rowsFromDictionary = (dictionary: KidLearningDictionary): DictionaryRow[] =>
  dictionary.entries.map((entry) => ({
    id: entry.id,
    image: entry.image,
    minimumAge: entry.minimumAge,
    enText: entry.translations.en?.text,
    enMeaning: entry.translations.en?.meaning,
    enAliases: entry.translations.en?.aliases?.map((alias) => alias.text).join(", "),
    viText: entry.translations.vi?.text,
    viClassifier: entry.translations.vi?.classifier,
    viMeaning: entry.translations.vi?.meaning,
    viAliases: entry.translations.vi?.aliases?.map((alias) => alias.text).join(", "),
    source: entry,
  }));

const aliasesFromText = (
  value: string | undefined,
  existing: NonNullable<KidLearningDictionaryEntry["translations"]["en"]>["aliases"],
) => (value ?? "").split(",").map((text) => text.trim()).filter(Boolean).map((text) =>
  existing?.find((alias) => alias.text === text) ?? { text });

function dictionaryFromRows(rows: DictionaryRow[]): KidLearningDictionary {
  return {
    schemaVersion: 2,
    entries: rows.map((row) => {
      const translations: KidLearningDictionaryEntry["translations"] = {};
      const enAliases = aliasesFromText(row.enAliases, row.source.translations.en?.aliases);
      const viAliases = aliasesFromText(row.viAliases, row.source.translations.vi?.aliases);
      if (row.enText?.trim()) translations.en = {
        ...row.source.translations.en,
        text: row.enText.trim(),
        meaning: row.enMeaning?.trim() || undefined,
        aliases: enAliases.length ? enAliases : undefined,
      };
      if (row.viText?.trim()) translations.vi = {
        ...row.source.translations.vi,
        text: row.viText.trim(),
        classifier: row.viClassifier?.trim() || undefined,
        meaning: row.viMeaning?.trim() || undefined,
        aliases: viAliases.length ? viAliases : undefined,
      };
      return {
        ...row.source,
        id: row.id.trim(),
        minimumAge: row.minimumAge,
        image: row.image?.trim() || undefined,
        translations,
      };
    }),
  };
}

export function KidLearningDictionaryEditor({
  topicId,
  dictionary,
  onSave,
}: {
  topicId: string;
  dictionary: KidLearningDictionary;
  onSave(dictionary: KidLearningDictionary): Promise<void>;
}) {
  const [rows, setRows] = useState(() => rowsFromDictionary(dictionary));
  const [selectedId, setSelectedId] = useState<string | null>(
    () => dictionary.entries[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<DictionaryRow | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const nextRows = rowsFromDictionary(dictionary);
    setRows(nextRows);
    setSelectedId((current) =>
      current && nextRows.some((row) => row.id === current)
        ? current
        : nextRows[0]?.id ?? null);
  }, [dictionary]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const dirty = Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify(selected));
  const draftValid = Boolean(draft?.id.trim() && draft.minimumAge >= 3 && draft.minimumAge <= 8);
  useEffect(() => {
    const filename = selected?.image?.replace(/^asset:/, "");
    if (!filename) { setImagePreview(null); setPreviewLoading(false); return; }
    let active = true;
    setImagePreview(null);
    setPreviewLoading(true);
    void window.getgo.readContentV2TopicAsset(topicId, filename)
      .then((value) => { if (active) setImagePreview(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [selected?.image, topicId]);
  const editFields = useMemo<FormSchema[]>(() => [
    [{ name: "id", label: "Concept ID", type: "text", required: true }, { name: "image", label: "Shared image", type: "text" }],
    { section: "English", fields: [
      { name: "enText", label: "Word", type: "text" },
      { name: "enMeaning", label: "Meaning", type: "textarea", rows: 2 },
      { name: "enAliases", label: "Aliases", helper: "Separate aliases with commas.", type: "text" },
    ] },
    { section: "Vietnamese", fields: [
      [{ name: "viClassifier", label: "Classifier", type: "text" }, { name: "viText", label: "Word", type: "text" }],
      { name: "viMeaning", label: "Meaning", type: "textarea", rows: 2 },
      { name: "viAliases", label: "Aliases", helper: "Separate aliases with commas.", type: "text" },
    ] },
    { name: "minimumAge", label: "Minimum age", type: "number", min: 3, max: 8, step: 1, required: true },
  ], []);
  const viewColumns = useMemo<DataColumn<DictionaryRow>[]>(() => [
    { key: "id", title: "Concept", width: "16%", sortValue: (row) => row.id, render: (row) => row.id },
    { key: "enText", title: "English word", width: "18%", sortValue: (row) => row.enText ?? "", render: (row) => row.enText || "—" },
    { key: "enMeaning", title: "English meaning", sortValue: (row) => row.enMeaning ?? "", render: (row) => row.enMeaning || "—" },
    { key: "viClassifier", title: "Vietnamese classifier", width: 150, sortValue: (row) => row.viClassifier ?? "", render: (row) => row.viClassifier || "—" },
    { key: "viText", title: "Vietnamese word", width: "18%", sortValue: (row) => row.viText ?? "", render: (row) => row.viText || "—" },
    { key: "minimumAge", title: "Age", width: 76, align: "right", sortValue: (row) => row.minimumAge, render: (row) => row.minimumAge },
  ], []);
  const saveDraft = async () => {
    if (!draft || !selected || saving || !dirty || !draftValid) return;
    const nextRows = rows.map((row) => row === selected ? draft : row);
    const nextDictionary = dictionaryFromRows(nextRows);
    setSaving(true);
    setError(null);
    try {
      await onSave(nextDictionary);
      setRows(nextRows);
      setSelectedId(draft.id);
      setDraft(null);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  useSaveShortcut({ active: Boolean(draft), enabled: dirty && draftValid && !saving, onSave: () => void saveDraft() });
  const deleteSelected = async () => {
    if (!selected || saving || !window.confirm(`Delete ${selected.enText || selected.viText || selected.id} from the shared dictionary?`)) return;
    const nextRows = rows.filter((row) => row !== selected);
    setSaving(true);
    setError(null);
    try {
      await onSave(dictionaryFromRows(nextRows));
      setRows(nextRows);
      setSelectedId(nextRows[0]?.id ?? null);
      setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  return (
    <div className="topic-dictionary-layout">
      <Panel
        title="Shared multilingual dictionary"
        description="Alphabet and spelling quizzes use these shared concepts, translations, and images."
      >
        {error && <div className="error-banner"><strong>Dictionary operation failed</strong><span>{error}</span></div>}
        <DataTable
          ariaLabel="Shared multilingual dictionary"
          columns={viewColumns}
          rows={rows}
          rowKey={(row) => row.id}
          defaultSort={{ key: "enText" }}
          selectedRowKey={selected?.id}
          onRowClick={(row) => { setSelectedId(row.id); setDraft(null); }}
          emptyText="No shared dictionary concepts yet."
        />
      </Panel>
      <Panel
        className={draft ? "topic-dictionary-detail-panel is-editing" : "topic-dictionary-detail-panel"}
        title={draft ? `Edit ${selected?.enText || selected?.viText || selected?.id || "word"}` : selected ? (selected.enText || selected.viText || selected.id) : "Word preview"}
        description={draft ? "Update this shared dictionary record." : selected ? selected.image || "No linked image" : "Select a word to see its information and linked image."}
        meta={selected ? draft ? <div className="topic-assets-actions">
          <Button variant="icon" icon={<X />} disabled={saving} aria-label="Cancel editing" title="Cancel" onClick={() => { setDraft(null); setError(null); }} />
          <Button variant="solid" color="success" className="topic-header-icon-action" icon={<Save />} loading={saving} disabled={!dirty || !draftValid || saving} aria-label="Save word" title="Save" onClick={() => void saveDraft()} />
        </div> : <div className="topic-assets-actions">
          <Button variant="solid" color="danger" className="topic-header-icon-action" icon={<Trash2 />} disabled={saving} aria-label="Delete word" title="Delete" onClick={() => void deleteSelected()} />
          <Button variant="solid" className="topic-header-icon-action" icon={<Pencil />} disabled={saving} aria-label="Edit word" title="Edit" onClick={() => setDraft({ ...selected })} />
        </div> : undefined}
      >
        {draft ? <div className="crud-body topic-dictionary-edit-form"><Form
            fields={editFields}
            values={draft}
            onChange={(name, value) => setDraft((current) => current ? { ...current, [name]: value } : current)}
          /></div> : selected ? <div className="topic-dictionary-preview">
          <div className="topic-dictionary-preview-summary">
            <div className="topic-dictionary-preview-image">
              {previewLoading ? <span>Loading image…</span> : imagePreview ? <img src={imagePreview} alt={selected.enText || selected.viText || selected.id} /> : <span>No linked image</span>}
            </div>
            <div className="topic-dictionary-preview-identity">
              <span className="topic-dictionary-preview-id">{selected.id}</span>
              <strong>{selected.enText || selected.viText || selected.id}</strong>
              {selected.viText && <span>{[selected.viClassifier, selected.viText].filter(Boolean).join(" ")}</span>}
              <small>Minimum age {selected.minimumAge}</small>
            </div>
          </div>
          <div className="topic-dictionary-language-card">
            <span className="topic-dictionary-language">English</span>
            <strong>{selected.enText || "Not provided"}</strong>
            {selected.enMeaning && <p>{selected.enMeaning}</p>}
            <div className="topic-dictionary-language-meta">
              {selected.source.translations.en?.spelling && <span><b>Spelling</b>{selected.source.translations.en.spelling}</span>}
              {selected.source.translations.en?.pronunciation && <span><b>Pronunciation</b>{selected.source.translations.en.pronunciation}</span>}
              {selected.enAliases && <span><b>Aliases</b>{selected.enAliases}</span>}
            </div>
          </div>
          <div className="topic-dictionary-language-card">
            <span className="topic-dictionary-language">Vietnamese</span>
            <strong>{[selected.viClassifier, selected.viText].filter(Boolean).join(" ") || "Not provided"}</strong>
            {selected.viMeaning && <p>{selected.viMeaning}</p>}
            <div className="topic-dictionary-language-meta">
              {selected.source.translations.vi?.spelling && <span><b>Spelling</b>{selected.source.translations.vi.spelling}</span>}
              {selected.source.translations.vi?.pronunciation && <span><b>Pronunciation</b>{selected.source.translations.vi.pronunciation}</span>}
              {selected.viAliases && <span><b>Aliases</b>{selected.viAliases}</span>}
            </div>
          </div>
        </div> : <div className="topic-dictionary-preview-empty">No word selected</div>}
      </Panel>
    </div>
  );
}
