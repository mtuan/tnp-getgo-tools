import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Save } from "lucide-react";
import type {
  AlphabetLetterResource,
  QuizQuestionRecord,
} from "../core/models";
import { alphabetData } from "../core/alphabet-question";
import { Button } from "./ui/Button";
import { DataTable, type DataColumn } from "./ui/DataTable";
import { EditTable, type EditColumnDef } from "./ui/EditTable";
import { Panel } from "./ui/Panel";

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

function resourceKind(url: string) {
  try {
    const host = new URL(url).hostname.toLocaleLowerCase();
    return host === "youtu.be" || host.endsWith(".youtube.com")
      ? "YouTube"
      : "Link";
  } catch {
    return "Invalid URL";
  }
}

export function AlphabetResourcesEditor({ questions, onSave, onOpen, onSaved }: Props) {
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
  const resourceColumns: EditColumnDef<AlphabetLetterResource>[] = [
    {
      key: "kind",
      dataKey: "url",
      title: "Type",
      width: 90,
      field: { type: "text", name: "url" },
      renderView: (value) => resourceKind(String(value ?? "")),
    },
    { key: "title", dataKey: "title", title: "Title", width: "25%", field: { type: "text", name: "title", required: true, placeholder: "Video or resource title" } },
    { key: "url", dataKey: "url", title: "URL", width: "38%", field: { type: "url", name: "url", required: true, placeholder: "https://www.youtube.com/watch?v=…" } },
    { key: "description", dataKey: "description", title: "Description", field: { type: "text", name: "description", placeholder: "Optional note" } },
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
          <Button icon={<Save />} variant="solid" loading={saving} disabled={!dirty || saving} onClick={() => void save()}>
            Save resources
          </Button>
        }
      >
        {error && <div className="error-banner"><strong>Could not save resources</strong><span>{error}</span></div>}
        <EditTable
          ariaLabel={`Resources for ${selected?.letter ?? "letter"}`}
          rows={draft}
          columns={resourceColumns}
          rowKey="id"
          addLabel="Add resource"
          emptyText="No external resources for this letter yet."
          onRowAdd={() => setDraft((current) => [...current, { id: `resource-${Date.now().toString(36)}`, title: "", url: "", description: "" }])}
          onRowChange={(index, field, value) => setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: String(value ?? "") } : item))}
          onRowDelete={(index) => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
        />
        {draft.some((item) => item.url && resourceKind(item.url) !== "Invalid URL") && (
          <div className="alphabet-resource-links">
            {draft.filter((item) => item.url && resourceKind(item.url) !== "Invalid URL").map((item) => (
              <Button key={item.id} variant="text" icon={<ExternalLink />} onClick={() => void onOpen(item.url)}>{item.title || item.url}</Button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
