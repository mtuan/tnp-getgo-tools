import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { alphabetData } from "../core/alphabet-question";
import { isAlphabetLetterCharacter } from "../core/alphabet-letter";
import type {
  AlphabetQuestionContent,
  AlphabetSample,
  QuizQuestionRecord,
  QuizType,
} from "../core/models";
import { EditTable, type EditColumnDef } from "./ui/EditTable";
import { Button } from "./ui/Button";
import { Form, type FormSchema } from "./ui/Form";
import { Panel } from "./ui/Panel";
import { PreviewAsset } from "./ui/QuestionPreview";
import { Tabs } from "./ui/Tabs";

export type AlphabetEditorTab = "info" | "related-words";

interface Props {
  quizType: Extract<QuizType, "alphabet-english" | "alphabet-vietnamese">;
  manifestPath: string;
  record: QuizQuestionRecord;
  tab: AlphabetEditorTab;
  onTabChange(tab: AlphabetEditorTab): void;
  onChange(record: QuizQuestionRecord): void;
}

export function AlphabetLetterEditor({
  quizType,
  manifestPath,
  record,
  tab,
  onTabChange,
  onChange,
}: Props) {
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const speechPauseRef = useRef<number | null>(null);
  const language =
    quizType === "alphabet-vietnamese" ? "Vietnamese" : "English";
  const alphabet = alphabetData(record);
  const selectedSample =
    alphabet.samples[
      Math.min(selectedSampleIndex, Math.max(0, alphabet.samples.length - 1))
    ];
  const selectedWord = selectedSample
    ? [selectedSample.classifier, selectedSample.text].filter(Boolean).join(" ")
    : "";
  const highlightedWord = selectedSample
    ? Array.from(selectedSample.text).map((character, index) =>
        isAlphabetLetterCharacter(character, alphabet.letter, language) ? (
          <mark className="alphabet-word-letter" key={index}>
            {character}
          </mark>
        ) : (
          character
        ),
      )
    : null;
  const speakWord = () => {
    if (!selectedWord || !("speechSynthesis" in window)) return;
    if (speechPauseRef.current !== null) {
      window.clearTimeout(speechPauseRef.current);
      speechPauseRef.current = null;
    }
    window.speechSynthesis.cancel();
    const speechLanguage =
      quizType === "alphabet-vietnamese" ? "vi-VN" : "en-US";
    const wordUtterance = new SpeechSynthesisUtterance(selectedWord);
    wordUtterance.lang = speechLanguage;
    wordUtterance.rate = 0.65;
    wordUtterance.pitch = 1.08;
    if (selectedSample?.meaning) {
      wordUtterance.onend = () => {
        speechPauseRef.current = window.setTimeout(() => {
          const meaningUtterance = new SpeechSynthesisUtterance(
            selectedSample.meaning,
          );
          meaningUtterance.lang = speechLanguage;
          meaningUtterance.rate = 1;
          window.speechSynthesis.speak(meaningUtterance);
          speechPauseRef.current = null;
        }, 500);
      };
    }
    window.speechSynthesis.speak(wordUtterance);
  };
  const speakLetter = () => {
    const spokenText = alphabet.pronunciation || alphabet.letter;
    if (!spokenText || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = quizType === "alphabet-vietnamese" ? "vi-VN" : "en-US";
    utterance.rate = 0.75;
    window.speechSynthesis.speak(utterance);
  };
  useEffect(
    () => () => {
      if (speechPauseRef.current !== null) {
        window.clearTimeout(speechPauseRef.current);
      }
      window.speechSynthesis?.cancel();
    },
    [selectedSampleIndex, tab],
  );
  const update = (next: AlphabetQuestionContent) =>
    onChange({
      question_no: record.question_no,
      status: record.status,
      verified: record.verified,
      feedback: record.feedback,
      type: "alphabet",
      ...next,
    });
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
    ...(quizType === "alphabet-vietnamese"
      ? ([
          {
            key: "classifier",
            dataKey: "classifier",
            title: "Classifier",
            width: "15%",
            field: {
              name: "classifier",
              type: "text",
              placeholder: "con, cái, quả…",
            },
          },
        ] satisfies EditColumnDef<AlphabetSample>[])
      : []),
    {
      key: "meaning",
      dataKey: "meaning",
      title: "Simple meaning",
      field: { name: "meaning", type: "text" },
    },
    {
      key: "image",
      dataKey: "image",
      title: "Image",
      width: "112px",
      field: { name: "image", type: "text" },
      renderView: (value, sample) => (
        <div className="alphabet-sample-image">
          {typeof value === "string" && value ? (
            <PreviewAsset
              manifestPath={manifestPath}
              value={value}
              alt={`Illustration for ${sample.text || "related word"}`}
            />
          ) : (
            <span aria-label="No image">—</span>
          )}
        </div>
      ),
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
              description="Simple words, meanings, and illustrations for this letter."
            >
              <EditTable<AlphabetSample>
                ariaLabel="Letter samples"
                columns={sampleColumns}
                rows={alphabet.samples}
                rowKey={(_, index) => String(index)}
                selectedRowIndex={selectedSampleIndex}
                onRowClick={(_, index) => setSelectedSampleIndex(index)}
                addLabel="Add related word"
                emptyText="No related words yet."
                onRowAdd={() =>
                  update({
                    ...alphabet,
                    samples: [
                      ...alphabet.samples,
                      { text: "", classifier: "", meaning: "", image: "" },
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
                onRowDelete={(index) => {
                  setSelectedSampleIndex((current) =>
                    Math.max(
                      0,
                      Math.min(
                        current > index ? current - 1 : current,
                        alphabet.samples.length - 2,
                      ),
                    ),
                  );
                  update({
                    ...alphabet,
                    samples: alphabet.samples.filter(
                      (_, sampleIndex) => sampleIndex !== index,
                    ),
                  });
                }}
              />
            </Panel>
          )}
        </div>
        <div className="advanced-question-sidebar">
          {tab === "info" ? (
            <Panel
              className="question-preview-panel"
              title="Letter preview"
              description="How the letter forms appear to the learner."
            >
              <div
                className="alphabet-letter-preview"
                aria-label={`${language} letter preview`}
              >
                <div className="alphabet-letter-forms">
                  <strong>{alphabet.uppercase || "—"}</strong>
                  <span>{alphabet.lowercase || "—"}</span>
                </div>
                <Button
                  variant="solid"
                  icon={<Volume2 />}
                  disabled={!alphabet.pronunciation && !alphabet.letter}
                  onClick={speakLetter}
                >
                  Play audio
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel
              className="question-preview-panel"
              title="Word preview"
              description="How the selected related word appears to the learner."
            >
              {selectedSample ? (
                <div className="alphabet-word-preview">
                  <div className="alphabet-word-preview-image">
                    {selectedSample.image ? (
                      <PreviewAsset
                        manifestPath={manifestPath}
                        value={selectedSample.image}
                        alt={`Illustration for ${selectedSample.text}`}
                      />
                    ) : (
                      <span>No image</span>
                    )}
                  </div>
                  <strong>
                    {selectedSample.classifier
                      ? `${selectedSample.classifier} `
                      : null}
                    {highlightedWord || "Untitled word"}
                  </strong>
                  <p>{selectedSample.meaning || "No meaning provided."}</p>
                  <Button
                    variant="solid"
                    icon={<Volume2 />}
                    disabled={!selectedWord}
                    onClick={speakWord}
                  >
                    Play audio
                  </Button>
                </div>
              ) : (
                <div className="alphabet-word-preview-empty">
                  Add a related word to preview it here.
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
