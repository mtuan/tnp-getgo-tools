import { useEffect, useRef, useState } from "react";
import { ExternalLink, Settings, Volume2 } from "lucide-react";
import { alphabetData } from "../core/alphabet-question";
import {
  alphabetWordStartsWithLetter,
  formatAlphabetWord,
  isAlphabetLetterCharacter,
} from "../core/alphabet-letter";
import type {
  AppSettings,
  AlphabetQuestionContent,
  AlphabetSample,
  QuizQuestionRecord,
  QuizType,
  SpeechLanguage,
  SpeechLanguageSettings,
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
import { SpeechSettingsDialog } from "./SpeechSettingsDialog";
import { logSpokenContent } from "./speech-log";
import { AlphabetResourceImportButton, AlphabetResourceTable, youtubeVideoId } from "./AlphabetResourceTable";

export type AlphabetEditorTab = "info" | "related-words" | "resources";

function setPreferredSpeechVoice(
  utterance: SpeechSynthesisUtterance,
  language: string,
  voiceURI: string,
) {
  const normalizedLanguage = language.toLocaleLowerCase();
  const languagePrefix = normalizedLanguage.split("-")[0];
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((candidate) => candidate.voiceURI === voiceURI) ||
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
  speechSettings: AppSettings["speech"];
  manifestPath: string;
  record: QuizQuestionRecord;
  dictionaryWords: AlphabetSample[];
  tab: AlphabetEditorTab;
  onTabChange(tab: AlphabetEditorTab): void;
  onChange(record: QuizQuestionRecord): void;
  onSpeechSettingsChange(
    language: SpeechLanguage,
    settings: SpeechLanguageSettings,
  ): Promise<void>;
}

function highlightAlphabetLetter(
  text: string,
  letter: string,
  language: "English" | "Vietnamese",
) {
  return Array.from(text).map((character, index) =>
    isAlphabetLetterCharacter(character, letter, language) ? (
      <mark className="alphabet-word-letter" key={index}>
        {character}
      </mark>
    ) : (
      character
    ),
  );
}

export function AlphabetLetterEditor({
  quizType,
  locale,
  speechSettings,
  manifestPath,
  record,
  dictionaryWords,
  tab,
  onTabChange,
  onChange,
  onSpeechSettingsChange,
}: Props) {
  const [selectedSampleIndex, setSelectedSampleIndex] = useState(0);
  const [wordFilter, setWordFilter] = useState("");
  const [speechSettingsOpen, setSpeechSettingsOpen] = useState(false);
  const [selectedResourceIndex, setSelectedResourceIndex] = useState(0);
  const [resolvingResourceDurations, setResolvingResourceDurations] = useState(false);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechPauseRef = useRef<number | null>(null);
  const durationAttemptsRef = useRef(new Set<string>());
  const recordRef = useRef(record);
  const onChangeRef = useRef(onChange);
  recordRef.current = record;
  onChangeRef.current = onChange;
  const language =
    quizType === "alphabet-vietnamese" ? "Vietnamese" : "English";
  const alphabet = alphabetData(record);
  const missingResourceDurationKey = alphabet.resources
    .filter((resource) => youtubeVideoId(resource.url) && !(typeof resource.durationSeconds === "number" && resource.durationSeconds > 0))
    .map((resource) => resource.url)
    .join("\n");
  const selectedResource = alphabet.resources[Math.min(selectedResourceIndex, Math.max(0, alphabet.resources.length - 1))];
  const selectedYouTubeId = selectedResource ? youtubeVideoId(selectedResource.url) : null;
  const copy = (locale === "vi" ? vi : en).alphabetEditor;
  const wordLocale = quizType === "alphabet-vietnamese" ? "vi" : "en";
  const activeSpeechSettings = speechSettings[wordLocale];
  const relatedWords = dictionaryWords
    .filter((word) =>
      alphabetWordStartsWithLetter(word.text, alphabet.letter, language),
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
    ? formatAlphabetWord(
        selectedSample.text,
        selectedSample.classifier,
        wordLocale,
      )
    : "";
  const displayedClassifier =
    selectedSample?.classifier && selectedWord !== selectedSample.text.trim()
      ? `${selectedSample.classifier.trim()} `
      : "";
  const highlightedWord = selectedSample
    ? highlightAlphabetLetter(selectedSample.text, alphabet.letter, language)
    : null;
  const fallbackLetter =
    alphabet.lowercase ||
    alphabet.letter.toLocaleLowerCase(
      quizType === "alphabet-vietnamese" ? "vi" : "en",
    );
  const spokenLetter =
    alphabet.pronunciation?.trim() ||
    (fallbackLetter ? `"${fallbackLetter}"` : "");
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
    setPreferredSpeechVoice(
      wordUtterance,
      speechLanguage,
      activeSpeechSettings.voiceURI,
    );
    wordUtterance.rate = activeSpeechSettings.wordRate;
    wordUtterance.pitch = 1.08;
    logSpokenContent(selectedWord, speechLanguage, "word");
    const spokenMeaning = selectedSample?.meaning;
    if (spokenMeaning) {
      wordUtterance.onend = () => {
        speechPauseRef.current = window.setTimeout(() => {
          const meaningUtterance = new SpeechSynthesisUtterance(spokenMeaning);
          meaningUtterance.lang = speechLanguage;
          setPreferredSpeechVoice(
            meaningUtterance,
            speechLanguage,
            activeSpeechSettings.voiceURI,
          );
          meaningUtterance.rate = activeSpeechSettings.meaningRate;
          logSpokenContent(
            spokenMeaning,
            speechLanguage,
            "meaning",
          );
          window.speechSynthesis.speak(meaningUtterance);
          speechPauseRef.current = null;
        }, activeSpeechSettings.pauseMs);
      };
    }
    window.speechSynthesis.speak(wordUtterance);
  };
  const speakLetter = () => {
    if (!spokenLetter || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenLetter);
    utterance.lang = quizType === "alphabet-vietnamese" ? "vi-VN" : "en-US";
    setPreferredSpeechVoice(
      utterance,
      utterance.lang,
      activeSpeechSettings.voiceURI,
    );
    utterance.rate = activeSpeechSettings.letterRate;
    logSpokenContent(spokenLetter, utterance.lang, "letter");
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
  useEffect(() => setSelectedResourceIndex(0), [alphabet.letter]);
  useEffect(() => setSelectedSampleIndex(0), [wordFilter]);
  useEffect(() => {
    if (tab !== "resources") return;
    const missing = alphabet.resources.filter((resource) =>
      youtubeVideoId(resource.url) &&
      !(typeof resource.durationSeconds === "number" && resource.durationSeconds > 0) &&
      !durationAttemptsRef.current.has(`${record.question_no}:${resource.url}`),
    );
    if (!missing.length) return;
    const resolver = window.getgo.resolveYouTubeResources;
    if (typeof resolver !== "function") return;
    for (const resource of missing) {
      durationAttemptsRef.current.add(`${record.question_no}:${resource.url}`);
    }
    let active = true;
    setResolvingResourceDurations(true);
    void resolver(missing.map((resource) => resource.url))
      .then((resolved) => {
        if (!active) return;
        const durationsByVideoId = new Map<string, number>();
        for (const resource of resolved) {
          const videoId = youtubeVideoId(resource.url);
          if (videoId && typeof resource.durationSeconds === "number" && resource.durationSeconds > 0) {
            durationsByVideoId.set(videoId, resource.durationSeconds);
          }
        }
        if (!durationsByVideoId.size) return;
        const currentRecord = recordRef.current;
        const currentAlphabet = alphabetData(currentRecord);
        let changed = false;
        const resources = currentAlphabet.resources.map((resource) => {
          if (typeof resource.durationSeconds === "number" && resource.durationSeconds > 0) return resource;
          const videoId = youtubeVideoId(resource.url);
          const durationSeconds = videoId ? durationsByVideoId.get(videoId) : undefined;
          if (!durationSeconds) return resource;
          changed = true;
          return { ...resource, durationSeconds };
        });
        if (!changed) return;
        setResolvingResourceDurations(false);
        onChangeRef.current({
          question_no: currentRecord.question_no,
          status: currentRecord.status,
          verified: currentRecord.verified,
          feedback: currentRecord.feedback,
          type: "alphabet",
          ...currentAlphabet,
          resources,
        });
      })
      .catch((cause) => console.error("[GetGo Tools][YouTube resources] Failed to fetch missing durations", cause))
      .finally(() => {
        if (active) setResolvingResourceDurations(false);
      });
    return () => {
      active = false;
      for (const resource of missing) {
        durationAttemptsRef.current.delete(`${record.question_no}:${resource.url}`);
      }
    };
  }, [missingResourceDurationKey, record.question_no, tab]);
  useEffect(() => {
    const refreshVoices = () =>
      setSpeechVoices(window.speechSynthesis.getVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () =>
      window.speechSynthesis.removeEventListener(
        "voiceschanged",
        refreshVoices,
      );
  }, []);
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
      sortValue: (word) => word.text,
      render: (word) => (
        <strong>
          {highlightAlphabetLetter(word.text, alphabet.letter, language)}
        </strong>
      ),
    },
    ...(quizType === "alphabet-vietnamese"
      ? ([
          {
            key: "classifier",
            title: "Classifier",
            width: "15%",
            sortValue: (word) => word.classifier || "",
            render: (word) => word.classifier || "—",
          },
        ] satisfies DataColumn<AlphabetSample>[])
      : []),
    {
      key: "meaning",
      title: "Simple meaning",
      sortValue: (word) => word.meaning || "",
      render: (word) => word.meaning || "—",
    },
    {
      key: "minimumAge",
      title: "Age",
      width: 72,
      align: "center",
      sortValue: (word) => word.minimumAge ?? Number.MAX_SAFE_INTEGER,
      render: (word) =>
        Number.isInteger(word.minimumAge) ? `${word.minimumAge}+` : "—",
    },
    {
      key: "image",
      title: "Image",
      width: 72,
      align: "center",
      sortValue: (word) => word.image || "",
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
          },
          {
            id: "resources",
            label: "Resources",
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
          ) : tab === "related-words" ? (
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
                selectedRowKey={selectedSample?.text}
                onRowClick={(word) =>
                  setSelectedSampleIndex(filteredRelatedWords.indexOf(word))
                }
                sortLocale={wordLocale}
                emptyText="No dictionary words contain this letter."
              />
            </Panel>
          ) : (
            <Panel
              className="alphabet-dictionary-panel"
              title={`Resources for ${alphabet.uppercase || alphabet.letter}`}
              description="YouTube videos and other external learning links stored on this letter."
              meta={
                <div className="panel-heading-actions">
                  {resolvingResourceDurations && <span>Fetching missing durations…</span>}
                  <AlphabetResourceImportButton resources={alphabet.resources} onChange={(resources) => update({ ...alphabet, resources })} />
                </div>
              }
            >
              <AlphabetResourceTable
                letter={alphabet.uppercase || alphabet.letter}
                resources={alphabet.resources}
                onChange={(resources) => update({ ...alphabet, resources })}
                selectedRowIndex={alphabet.resources.length ? Math.min(selectedResourceIndex, alphabet.resources.length - 1) : undefined}
                onRowSelect={setSelectedResourceIndex}
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
                <div className="alphabet-letter-pronunciation">
                  <span>Pronunciation hint</span>
                  <strong>{alphabet.pronunciation?.trim() || "—"}</strong>
                </div>
                <Button
                  variant="solid"
                  icon={<Volume2 />}
                  disabled={!alphabet.pronunciation && !alphabet.letter}
                  onClick={speakLetter}
                >
                  Speak: {spokenLetter || "—"}
                </Button>
              </div>
            </Panel>
          ) : tab === "related-words" ? (
            <Panel
              className="question-preview-panel"
              title="Word preview"
              description="How the selected related word appears to the learner."
              meta={
                <Button
                  variant="icon"
                  color="neutral"
                  icon={<Settings />}
                  aria-label={copy.speechSettings}
                  title={copy.speechSettings}
                  onClick={() => setSpeechSettingsOpen(true)}
                />
              }
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
                    {displayedClassifier}
                    {highlightedWord || "Untitled word"}
                  </strong>
                  <p>{selectedSample.meaning || "No meaning provided."}</p>
                  <Button
                    variant="solid"
                    icon={<Volume2 />}
                    disabled={!selectedWord}
                    onClick={speakWord}
                  >
                    Speak: {selectedWord}
                  </Button>
                </div>
              ) : (
                <div className="alphabet-word-preview-empty">
                  Add a related word to preview it here.
                </div>
              )}
            </Panel>
          ) : (
            <Panel
              className="question-preview-panel"
              title="Resource preview"
              description="Select a resource from the list to preview it."
            >
              {selectedResource ? (
                <div className="alphabet-resource-preview">
                  {selectedYouTubeId ? (
                    <div className="alphabet-resource-player">
                      <iframe
                        key={selectedYouTubeId}
                        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(selectedYouTubeId)}`}
                        title={selectedResource.title || "YouTube video preview"}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="alphabet-resource-link-placeholder"><ExternalLink /></div>
                  )}
                  <div className="alphabet-resource-preview-copy">
                    <strong>{selectedResource.title || "Untitled resource"}</strong>
                    {selectedResource.description && <p>{selectedResource.description}</p>}
                    <small>{selectedResource.url || "No URL"}</small>
                    <Button icon={<ExternalLink />} disabled={!selectedResource.url} onClick={() => void window.getgo.openExternal(selectedResource.url)}>Open link</Button>
                  </div>
                </div>
              ) : <div className="alphabet-word-preview-empty">No resource selected.</div>}
            </Panel>
          )}
        </div>
      </div>
      {speechSettingsOpen && (
        <SpeechSettingsDialog
          language={wordLocale}
          locale={locale}
          settings={activeSpeechSettings}
          voices={speechVoices}
          onClose={() => setSpeechSettingsOpen(false)}
          onSave={(next) => onSpeechSettingsChange(wordLocale, next)}
        />
      )}
    </>
  );
}
