import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import type {
  AlphabetDictionary,
  AlphabetSample,
  AppSettings,
  QuizType,
} from "../core/models";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { Button } from "./ui/Button";
import { EditTable, type EditColumnDef } from "./ui/EditTable";
import { Panel } from "./ui/Panel";

interface Props {
  dictionary: AlphabetDictionary;
  locale: AppSettings["locale"];
  quizType: Exclude<QuizType, "question-list">;
  onSave(dictionary: AlphabetDictionary): Promise<void>;
}

export function AlphabetDictionaryEditor({
  dictionary,
  locale,
  quizType,
  onSave,
}: Props) {
  const copy = (locale === "vi" ? vi : en).alphabetDictionary;
  const [words, setWords] = useState<AlphabetSample[]>(() =>
    structuredClone(dictionary.words),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWords(structuredClone(dictionary.words));
    setError(null);
  }, [dictionary]);

  const columns = useMemo<EditColumnDef<AlphabetSample>[]>(
    () => [
      {
        key: "text",
        dataKey: "text",
        title: copy.text,
        width: "18%",
        field: { name: "text", label: copy.text, type: "text", required: true },
      },
      ...(quizType.endsWith("vietnamese")
        ? [{
            key: "classifier",
            dataKey: "classifier" as const,
            title: copy.classifier,
            width: "14%",
            field: { name: "classifier", label: copy.classifier, type: "text" as const },
          }]
        : []),
      {
        key: "meaning",
        dataKey: "meaning",
        title: copy.meaning,
        width: "30%",
        field: { name: "meaning", label: copy.meaning, type: "text" },
      },
      {
        key: "image",
        dataKey: "image",
        title: copy.image,
        width: "25%",
        field: { name: "image", label: copy.image, type: "text" },
      },
      {
        key: "minimumAge",
        dataKey: "minimumAge",
        title: copy.age,
        width: 110,
        field: {
          name: "minimumAge",
          label: copy.age,
          type: "number",
          min: 3,
          max: 8,
          step: 1,
          required: true,
        },
      },
    ],
    [copy, quizType],
  );
  const dirty = JSON.stringify(words) !== JSON.stringify(dictionary.words);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ schemaVersion: 1, words });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      className="alphabet-dictionary-panel"
      title={copy.title}
      description={copy.description}
      meta={
        <Button
          variant="solid"
          icon={<Save />}
          loading={saving}
          disabled={!dirty}
          onClick={save}
        >
          {copy.save}
        </Button>
      }
    >
      {error && (
        <div className="error-banner">
          <strong>{copy.saveError}</strong>
          <span>{error}</span>
        </div>
      )}
      <EditTable
        ariaLabel={copy.title}
        columns={columns}
        rows={words}
        rowKey={(word, index) => `${word.text}-${index}`}
        addLabel={copy.add}
        emptyText={copy.empty}
        onRowAdd={() =>
          setWords((current) => [
            ...current,
            { text: "", meaning: "", image: "", minimumAge: 3 },
          ])
        }
        onRowChange={(index, field, value) =>
          setWords((current) =>
            current.map((word, wordIndex) =>
              wordIndex === index ? { ...word, [field]: value } : word,
            ),
          )
        }
        onRowDelete={(index) =>
          setWords((current) => current.filter((_, wordIndex) => wordIndex !== index))
        }
      />
    </Panel>
  );
}
