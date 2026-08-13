import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type {
  AlphabetLetterResource,
  QuizQuestionRecord,
} from "../core/models";
import { alphabetData } from "../core/alphabet-question";
import { Button } from "./ui/Button";
import { DataTable, type DataColumn } from "./ui/DataTable";
import { Panel } from "./ui/Panel";
import { AlphabetResourceImportButton, AlphabetResourceTable } from "./AlphabetResourceTable";
import { useSaveShortcut } from "./ui/useSaveShortcut";

interface LetterRow {
  record: QuizQuestionRecord;
  letter: string;
  resourceCount: number;
}

interface Props {
  questions: QuizQuestionRecord[];
  onSave(record: QuizQuestionRecord): Promise<QuizQuestionRecord>;
  onOpen(url: string): Promise<void>;
  onSaved(record: QuizQuestionRecord): void;
}

export function AlphabetResourcesEditor({ questions, onSave, onSaved }: Props) {
  const rows = useMemo<LetterRow[]>(() => questions
    .filter((record) => record.type === "alphabet")
    .map((record) => ({
      record,
      letter: alphabetData(record).uppercase,
      resourceCount: alphabetData(record).resources.length,
    })), [questions]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = rows[Math.min(selectedIndex, Math.max(0, rows.length - 1))];
  const [draft, setDraft] = useState<AlphabetLetterResource[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(selected ? structuredClone(alphabetData(selected.record).resources) : []);
    setError(null);
  }, [selected]);

  const letterColumns: DataColumn<LetterRow>[] = [
    { key: "letter", title: "Letter", render: (row) => <strong>{row.letter}</strong> },
    { key: "resourceCount", title: "Resources", align: "center", width: 110, render: (row) => row.resourceCount },
  ];
  const dirty = selected
    ? JSON.stringify(draft) !== JSON.stringify(alphabetData(selected.record).resources)
    : false;

  const save = async () => {
    if (!selected || selected.record.type !== "alphabet" || !dirty) return;
    const invalid = draft.find((item) => {
      if (!item.title.trim()) return true;
      try { new URL(item.url); return false; } catch { return true; }
    });
    if (invalid) {
      setError("Every resource needs a title and a valid http(s) URL.");
      return;
    }
    if (draft.some((item) => !/^https?:\/\//i.test(item.url))) {
      setError("Resource URLs must start with http:// or https://.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await onSave({ ...selected.record, resources: draft });
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };
  useSaveShortcut({ enabled: dirty && !saving, onSave: () => void save() });

  return (
    <div className="alphabet-resources-layout">
      <Panel title="Letters" description="Choose a letter to manage its learning links.">
        <DataTable
          ariaLabel="Alphabet resource letters"
          rows={rows}
          columns={letterColumns}
          rowKey={(row) => row.letter}
          selectedRowIndex={selectedIndex}
          onRowClick={(_, index) => {
            if (dirty && !window.confirm("Discard unsaved resource changes?")) return;
            setSelectedIndex(index);
          }}
          emptyText="No alphabet letters are available."
        />
      </Panel>
      <Panel
        title={selected ? `Resources for ${selected.letter}` : "Resources"}
        description="YouTube videos and other external learning links for this letter."
        meta={
          <div className="panel-heading-actions">
            <AlphabetResourceImportButton resources={draft} onChange={setDraft} />
            <Button icon={<RotateCcw />} color="neutral" disabled={!dirty || saving} onClick={() => setDraft(selected ? structuredClone(alphabetData(selected.record).resources) : [])}>
              Discard
            </Button>
            <Button icon={<Save />} variant="solid" loading={saving} disabled={!dirty || saving} onClick={() => void save()}>
              Save resources
            </Button>
          </div>
        }
      >
        {error && <div className="error-banner"><strong>Could not save resources</strong><span>{error}</span></div>}
        <AlphabetResourceTable letter={selected?.letter ?? ""} resources={draft} onChange={setDraft} />
      </Panel>
    </div>
  );
}
