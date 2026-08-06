import { useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import { alphabetData } from "../core/alphabet-question";
import {
  alphabetWordContainsLetter,
  isAlphabetLetterCharacter,
} from "../core/alphabet-letter";
import type {
  AppSettings,
  AlphabetQuestionContent,
  AlphabetSample,
  QuizQuestionRecord,
  QuizType,
} from "../core/models";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { Button } from "./ui/Button";
import { DataTable, type DataColumn } from "./ui/DataTable";
import { Form, type FormSchema } from "./ui/Form";
import { Panel } from "./ui/Panel";
import { PreviewAsset } from "./ui/QuestionPreview";
import { SearchField } from "./ui/SearchField";
import { Tabs } from "./ui/Tabs";

export type AlphabetEditorTab = "info" | "related-words";

function setPreferredSpeechVoice(
  utterance: SpeechSynthesisUtterance,
  language: string,
) {
  const normalizedLanguage = language.toLocaleLowerCase();
  const languagePrefix = normalizedLanguage.split("-")[0];
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find(
      (candidate) => candidate.lang.toLocaleLowerCase() === normalizedLanguage,
    ) ||
    voices.find((candidate) =>
      candidate.lang.toLocaleLowerCase().startsWith(`${languagePrefix}-`),
    );
  if (voice) utterance.voice = voice;
}

interface Props {
  quizType: Extract<QuizType, "alphabet-english" | "alphabet-vietnamese">;
  locale: AppSettings["locale"];
  manifestPath: string;
  record: QuizQuestionRecord;
  dictionaryWords: AlphabetSample[];
  tab: AlphabetEditorTab;
  onTabChange(tab: AlphabetEditorTab): void;
  onChange(record: QuizQuestionRecord): void;
}

export function AlphabetLetterEditor({
  quizType,
  locale,
  manifestPath,
  record,
  dictionaryWords,
  tab,
  onTabChange,
  onChange,
}: Props) {
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const [wordFilter, setWordFilter] = useState("");
  const speechPauseRef = useRef<number | null>(null);
  const language =
    quizType === "alphabet-vietnamese" ? "Vietnamese" : "English";
  const alphabet = alphabetData(record);
  const copy = (locale === "vi" ? vi : en).alphabetEditor;
  const wordLocale = quizType === "alphabet-vietnamese" ? "vi" : "en";
  const relatedWords = dictionaryWords
    .filter((word) =>
      alphabetWordContainsLetter(word.text, alphabet.letter, language),
    )
    .sort(
      (left, right) =>
        (left.minimumAge ?? Number.MAX_SAFE_INTEGER) -
          (right.minimumAge ?? Number.MAX_SAFE_INTEGER) ||
        left.text.localeCompare(right.text, wordLocale, {
          sensitivity: "base",
        }),
    );
  const normalizedWordFilter = wordFilter.trim().toLocaleLowerCase(wordLocale);
  const filteredRelatedWords = normalizedWordFilter
    ? relatedWords.filter((word) =>
        [word.text, word.classifier, word.meaning].some((value) =>
          value?.toLocaleLowerCase(wordLocale).includes(normalizedWordFilter),
        ),
      )
    : relatedWords;
  const selectedSample =
    filteredRelatedWords[
      Math.min(
        selectedSampleIndex,
        Math.max(0, filteredRelatedWords.length - 1),
      )
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
    setPreferredSpeechVoice(wordUtterance, speechLanguage);
    wordUtterance.rate = 0.65;
    wordUtterance.pitch = 1.08;
    if (selectedSample?.meaning) {
      wordUtterance.onend = () => {
        speechPauseRef.current = window.setTimeout(() => {
          const meaningUtterance = new SpeechSynthesisUtterance(
            selectedSample.meaning,
          );
          meaningUtterance.lang = speechLanguage;
          setPreferredSpeechVoice(meaningUtterance, speechLanguage);
          meaningUtterance.rate = 1;
          window.speechSynthesis.speak(meaningUtterance);
          speechPauseRef.current = null;
        }, 500);
      };
    }
    window.speechSynthesis.speak(wordUtterance);
  };
  const speakLetter = () => {
    const spokenText =
      alphabet.lowercase ||
      alphabet.letter.toLocaleLowerCase(
        quizType === "alphabet-vietnamese" ? "vi" : "en",
      );
    if (!spokenText || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = quizType === "alphabet-vietnamese" ? "vi-VN" : "en-US";
    setPreferredSpeechVoice(utterance, utterance.lang);
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
  useEffect(() => setSelectedSampleIndex(0), [alphabet.letter]);
  useEffect(() => setSelectedSampleIndex(0), [wordFilter]);
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
  const sampleColumns: DataColumn<AlphabetSample>[] = [
    {
      key: "text",
      title: "Word",
      width: "28%",
      render: (word) => <strong>{word.text}</strong>,
    },
    ...(quizType === "alphabet-vietnamese"
      ? ([
          {
            key: "classifier",
            title: "Classifier",
            width: "15%",
            render: (word) => word.classifier || "—",
          },
        ] satisfies DataColumn<AlphabetSample>[])
      : []),
    {
      key: "meaning",
      title: "Simple meaning",
      render: (word) => word.meaning || "—",
    },
    {
      key: "minimumAge",
      title: "Age",
      width: 72,
      align: "center",
      render: (word) =>
        Number.isInteger(word.minimumAge) ? `${word.minimumAge}+` : "—",
    },
    {
      key: "image",
      title: "Image",
      width: 72,
      align: "center",
      render: (word) => (
        <div className="alphabet-sample-image">
          {word.image ? (
            <PreviewAsset
              manifestPath={manifestPath}
              value={word.image}
              alt={`Illustration for ${word.text || "related word"}`}
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
            badge: relatedWords.length,
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
              className="alphabet-dictionary-panel"
              title="Related words"
              description="Read-only dictionary words containing this letter."
              meta={
                <SearchField
                  className="alphabet-word-filter"
                  value={wordFilter}
                  ariaLabel={copy.filterWords}
                  placeholder={copy.filterWords}
                  clearLabel={copy.clearFilter}
                  onValueChange={setWordFilter}
                />
              }
            >
              <DataTable<AlphabetSample>
                ariaLabel="Letter samples"
                columns={sampleColumns}
                rows={filteredRelatedWords}
                rowKey={(word) => word.text}
                selectedRowIndex={selectedSampleIndex}
                onRowClick={(_, index) => setSelectedSampleIndex(index)}
                emptyText="No dictionary words contain this letter."
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
