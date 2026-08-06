import { alphabetData } from "../core/alphabet-question";
import type {
  AlphabetQuestionData,
  AlphabetSample,
  QuizQuestionRecord,
  QuizType,
} from "../core/models";
import { EditTable, type EditColumnDef } from "./ui/EditTable";
import { Form, type FormSchema } from "./ui/Form";
import { Panel } from "./ui/Panel";
import { Tabs } from "./ui/Tabs";

export type AlphabetEditorTab = "info" | "related-words";

interface Props {
  quizType: Extract<QuizType, "alphabet-english" | "alphabet-vietnamese">;
  record: QuizQuestionRecord;
  tab: AlphabetEditorTab;
  onTabChange(tab: AlphabetEditorTab): void;
  onChange(record: QuizQuestionRecord): void;
}

export function AlphabetLetterEditor({
  quizType,
  record,
  tab,
  onTabChange,
  onChange,
}: Props) {
  const language =
    quizType === "alphabet-vietnamese" ? "Vietnamese" : "English";
  const alphabet = alphabetData(record);
  const update = (next: AlphabetQuestionData) =>
    onChange({ ...record, type: "alphabet", alphabet: next });
  const fields: FormSchema[] = [
    [
      { name: "letter", label: "Letter", type: "text", required: true },
      { name: "pronunciation", label: "Pronunciation hint", type: "text" },
    ],
    [
      { name: "uppercase", label: "Uppercase", type: "text", required: true },
      { name: "lowercase", label: "Lowercase", type: "text", required: true },
    ],
  ];
  const sampleColumns: EditColumnDef<AlphabetSample>[] = [
    {
      key: "text",
      dataKey: "text",
      title: "Word",
      width: "28%",
      field: { name: "text", type: "text" },
    },
    {
      key: "meaning",
      dataKey: "meaning",
      title: "Simple meaning",
      field: { name: "meaning", type: "text" },
    },
    {
      key: "image",
      dataKey: "image",
      title: "Image reference",
      width: "30%",
      field: { name: "image", type: "text", placeholder: "asset:apple.png" },
    },
  ];
  return (
    <>
      <Tabs<AlphabetEditorTab>
        className="question-editor-tabs"
        variant="underline"
        ariaLabel="Alphabet question editor"
        value={tab}
        onChange={onTabChange}
        items={[
          { id: "info", label: "Info" },
          {
            id: "related-words",
            label: "Related words",
            badge: alphabet.samples.length,
          },
        ]}
      />
      <div className="advanced-question-layout alphabet-letter-editor">
        <div className="advanced-question-editors">
          {tab === "info" ? (
            <Panel
              className="static-question-form-panel"
              title="Letter information"
              description={`${language} letter forms and speech metadata.`}
            >
              <div className="static-question-fields">
                <Form
                  fields={fields}
                  values={{ ...alphabet }}
                  autoFocus={false}
                  onChange={(name, value) =>
                    update({ ...alphabet, [name]: String(value ?? "") })
                  }
                />
              </div>
            </Panel>
          ) : (
            <Panel
              className="edit-table-panel"
              title="Related words"
              description="Simple words, meanings, and illustrated image references for this letter."
            >
              <EditTable<AlphabetSample>
                ariaLabel="Letter samples"
                columns={sampleColumns}
                rows={alphabet.samples}
                rowKey={(_, index) => String(index)}
                addLabel="Add related word"
                emptyText="No related words yet."
                onRowAdd={() =>
                  update({
                    ...alphabet,
                    samples: [
                      ...alphabet.samples,
                      { text: "", meaning: "", image: "" },
                    ],
                  })
                }
                onRowChange={(index, field, value) =>
                  update({
                    ...alphabet,
                    samples: alphabet.samples.map((sample, sampleIndex) =>
                      sampleIndex === index
                        ? { ...sample, [field]: String(value ?? "") }
                        : sample,
                    ),
                  })
                }
                onRowDelete={(index) =>
                  update({
                    ...alphabet,
                    samples: alphabet.samples.filter(
                      (_, sampleIndex) => sampleIndex !== index,
                    ),
                  })
                }
              />
            </Panel>
          )}
        </div>
        <div className="advanced-question-sidebar">
          <Panel
            className="question-preview-panel"
            title="Preview"
            description="The learner-facing letter forms."
          >
            <div
              className="alphabet-letter-preview"
              aria-label={`${language} letter preview`}
            >
              <strong>{alphabet.uppercase || "—"}</strong>
              <span>{alphabet.lowercase || "—"}</span>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
