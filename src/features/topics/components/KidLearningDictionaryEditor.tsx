import { useEffect, useMemo, useState } from "react";
import { Pencil, Save, Trash2, X } from "lucide-react";
import type { KidLearningDictionary, KidLearningDictionaryEntry } from "../../../shared/domain/models";
import { Button } from "../../../shared/ui/Button";
import { Checkbox } from "../../../shared/ui/Checkbox";
import { DataTable, type DataColumn } from "../../../shared/ui/DataTable";
import { Form, type FormSchema } from "../../../shared/ui/Form";
import { Panel } from "../../../shared/ui/Panel";
import { SearchField } from "../../../shared/ui/SearchField";
import { useSaveShortcut } from "../../../shared/ui/useSaveShortcut";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { DictionaryAssetThumbnail } from "./DictionaryAssetThumbnail";
import * as ui from "../../../shared/ui";

type DictionaryRow = {
  id: string;
  reviewed: boolean;
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
    reviewed: entry.reviewed === true,
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
        reviewed: row.reviewed,
        minimumAge: row.minimumAge,
        image: row.image?.trim() || undefined,
        translations,
      };
    }),
  };
}

export function KidLearningDictionaryEditor({
  topicId,
  locale,
  dictionary,
  onSave,
}: {
  topicId: string;
  locale: "en" | "vi";
  dictionary: KidLearningDictionary;
  onSave(dictionary: KidLearningDictionary): Promise<void>;
}) {
  const [rows, setRows] = useState(() => rowsFromDictionary(dictionary));
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    () => dictionary.entries[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<DictionaryRow | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reviewSavingIds, setReviewSavingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const nextRows = rowsFromDictionary(dictionary);
    if (JSON.stringify(nextRows) === JSON.stringify(rows)) return;
    setRows(nextRows);
    setSelectedId((current) =>
      current && nextRows.some((row) => row.id === current)
        ? current
        : nextRows[0]?.id ?? null);
  }, [dictionary]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const labels = (locale === "vi" ? vi : en).alphabetDictionary;
  const filteredRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase(locale);
    if (!query) return rows;
    return rows.filter((row) => [
      row.id, row.enText, row.enMeaning, row.enAliases,
      row.viClassifier, row.viText, row.viMeaning, row.viAliases,
    ].some((value) => value?.toLocaleLowerCase(locale).includes(query)));
  }, [filter, locale, rows]);
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
  const setReviewed = async (row: DictionaryRow, reviewed: boolean) => {
    if (saving || reviewSavingIds.size) return;
    const previousRows = rows;
    const nextRows = rows.map((item) => item.id === row.id
      ? { ...item, reviewed, source: { ...item.source, reviewed } }
      : item);
    setRows(nextRows);
    setReviewSavingIds(new Set([row.id]));
    setError(null);
    try {
      await onSave(dictionaryFromRows(nextRows));
    } catch (cause) {
      setRows(previousRows);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReviewSavingIds(new Set());
    }
  };
  const setAllReviewed = async (reviewed: boolean) => {
    if (saving || reviewSavingIds.size) return;
    const previousRows = rows;
    const nextRows = rows.map((row) => ({
      ...row,
      reviewed,
      source: { ...row.source, reviewed },
    }));
    setRows(nextRows);
    setReviewSavingIds(new Set(rows.map((row) => row.id)));
    setError(null);
    try {
      await onSave(dictionaryFromRows(nextRows));
    } catch (cause) {
      setRows(previousRows);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReviewSavingIds(new Set());
    }
  };
  const reviewedCount = rows.filter((row) => row.reviewed).length;
  const viewColumns = useMemo<DataColumn<DictionaryRow>[]>(() => [
    {
      key: "reviewed",
      title: <Checkbox
        checked={rows.length > 0 && reviewedCount === rows.length}
        indeterminate={reviewedCount > 0 && reviewedCount < rows.length}
        disabled={saving || reviewSavingIds.size > 0 || rows.length === 0}
        ariaLabel={labels.toggleAllReviewed}
        onCheckedChange={(checked) => void setAllReviewed(checked)}
      />,
      width: 44,
      align: "center",
      render: (row) => <Checkbox
        checked={row.reviewed}
        disabled={saving || reviewSavingIds.has(row.id)}
        ariaLabel={`${labels.reviewed}: ${row.enText || row.viText || row.id}`}
        onCheckedChange={(checked) => void setReviewed(row, checked)}
      />,
    },
    {
      key: "image",
      title: labels.image,
      width: 58,
      align: "center",
      render: (row) => <DictionaryAssetThumbnail
        topicId={topicId}
        reference={row.image}
        alt={row.enText || row.viText || row.id}
      />,
    },
    {
      key: "enText",
      title: labels.english,
      width: "calc((100% - 166px) / 2)",
      sortValue: (row) => row.enText ?? "",
      render: (row) => <span className="topic-dictionary-table-word">
        <strong>{row.enText || "—"}</strong>
        {row.enMeaning && <small>{row.enMeaning}</small>}
      </span>,
    },
    {
      key: "viText",
      title: labels.vietnamese,
      width: "calc((100% - 166px) / 2)",
      sortValue: (row) => row.viText ?? "",
      render: (row) => <span className="topic-dictionary-table-word">
        <strong>{[row.viClassifier, row.viText].filter(Boolean).join(" ") || "—"}</strong>
        {row.viMeaning && <small>{row.viMeaning}</small>}
      </span>,
    },
    { key: "minimumAge", title: labels.age, width: 64, align: "center", sortValue: (row) => row.minimumAge, render: (row) => row.minimumAge },
  ], [labels, reviewedCount, reviewSavingIds, saving, rows, topicId]);
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
        description={labels.reviewedHelp}
        meta={<SearchField
          value={filter}
          placeholder={labels.filter}
          ariaLabel={labels.filter}
          clearLabel={labels.clearFilter}
          onValueChange={setFilter}
        />}
      >
        {error && <div className="error-banner"><strong>Dictionary operation failed</strong><span>{error}</span></div>}
        <DataTable
          ariaLabel="Shared multilingual dictionary"
          columns={viewColumns}
          rows={filteredRows}
          rowKey={(row) => row.id}
          defaultSort={{ key: "enText" }}
          selectedRowKey={selected?.id}
          onRowClick={(row) => { setSelectedId(row.id); setDraft(null); }}
          emptyText="No shared dictionary concepts yet."
        />
      </Panel>
      <Panel
        className={draft ? "topic-dictionary-detail-panel topic-dictionary-preview-panel is-editing" : "topic-dictionary-detail-panel topic-dictionary-preview-panel"}
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
              <ui.Image
                src={imagePreview}
                alt={selected.enText || selected.viText || selected.id}
                fit="contain"
                inset={12}
                loading={previewLoading}
                fallback="No linked image"
              />
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
