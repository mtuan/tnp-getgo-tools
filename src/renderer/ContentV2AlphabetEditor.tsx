import { useEffect, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import type { ContentV2Question } from "../core/content-v2";
import type {
  AlphabetDictionary,
  AlphabetQuestionRecord,
  AppSettings,
  ContentV2QuestionSummary,
  ContentV2QuizSummary,
  ContentV2TopicSummary,
  RepositorySnapshot,
  SpeechLanguage,
  SpeechLanguageSettings,
} from "../core/models";
import { AlphabetLetterEditor, type AlphabetEditorTab } from "./AlphabetLetterEditor";
import { Button } from "./ui/Button";
import { PageHeader } from "./ui/PageHeader";
import { QuestionNavigator } from "./ui/QuestionNavigator";
import { SegmentedControl } from "./ui/SegmentedControl";

interface Props {
  locale: AppSettings["locale"];
  speechSettings: AppSettings["speech"];
  topic: ContentV2TopicSummary;
  quiz: ContentV2QuizSummary;
  question: ContentV2QuestionSummary;
  questions: ContentV2QuestionSummary[];
  route: string;
  onRouteChange(route: string): void;
  onRouteReplace(route: string): void;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onBackActionChange(action: (() => void) | null): void;
  onSpeechSettingsChange(language: SpeechLanguage, settings: SpeechLanguageSettings): Promise<void>;
}

function toEditor(record: Extract<ContentV2Question, { type: "alphabet-letter" }>): AlphabetQuestionRecord {
  return {
    type: "alphabet",
    question_no: record.order + 1,
    letter: record.letter,
    uppercase: record.uppercase,
    lowercase: record.lowercase,
    ...(record.pronunciation ? { pronunciation: record.pronunciation } : {}),
    ...(record.status === "reviewed" ? { status: "verified" } : record.status === "rejected" ? { status: "rejected" } : {}),
  };
}

export function ContentV2AlphabetEditor(props: Props) {
  const { topic, quiz, question } = props;
  const requestedTab = new URL(props.route, "app://getgo").searchParams.get("tab");
  const [tab, setTab] = useState<AlphabetEditorTab>(requestedTab === "related-words" ? "related-words" : "info");
  const [stored, setStored] = useState<Extract<ContentV2Question, { type: "alphabet-letter" }> | null>(null);
  const [draft, setDraft] = useState<AlphabetQuestionRecord | null>(null);
  const [dictionary, setDictionary] = useState<AlphabetDictionary>({ schemaVersion: 1, words: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backRoute = `/topics/${topic.id}/quizzes/${quiz.id}`;
  useEffect(() => {
    props.onBackActionChange(() => props.onRouteChange(backRoute));
    return () => props.onBackActionChange(null);
  }, [backRoute, props.onBackActionChange, props.onRouteChange]);
  useEffect(() => {
    let active = true;
    setDraft(null);
    setError(null);
    void Promise.all([
      window.getgo.loadContentV2Question(topic.id, quiz.id, question.id),
      window.getgo.loadContentV2QuizResources(topic.id, quiz.id),
    ]).then(([record, resources]) => {
      if (!active) return;
      if (record.type !== "alphabet-letter") throw new Error("This editor only supports alphabet letters.");
      setStored(record);
      setDraft(toEditor(record));
      const value = resources.dictionary as AlphabetDictionary | undefined;
      if (value?.words) setDictionary(value);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => { active = false; };
  }, [question.id, quiz.id, topic.id]);
  const save = async (nextDraft = draft) => {
    if (!stored || !nextDraft) return;
    setSaving(true);
    try {
      const next: ContentV2Question = {
        ...stored,
        status: nextDraft.status === "verified" ? "reviewed" : nextDraft.status === "rejected" ? "rejected" : "pending",
        letter: nextDraft.letter,
        uppercase: nextDraft.uppercase,
        lowercase: nextDraft.lowercase,
        pronunciation: nextDraft.pronunciation || undefined,
      };
      const snapshot = await window.getgo.saveContentV2Question(topic.id, quiz.id, next);
      setStored(next as Extract<ContentV2Question, { type: "alphabet-letter" }>);
      setDraft(toEditor(next as Extract<ContentV2Question, { type: "alphabet-letter" }>));
      props.onSnapshotChange(snapshot);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  const ordered = [...props.questions].sort((a, b) => a.order - b.order);
  const dirty = Boolean(stored && draft && JSON.stringify(toEditor(stored)) !== JSON.stringify(draft));
  return <section className="manager editor-page question-detail-page">
    <PageHeader eyebrow="Letter editor" breadcrumbs={[{ label: "Topics", onClick: () => props.onRouteChange("/topics") }, { label: topic.title, onClick: () => props.onRouteChange(`/topics/${topic.id}`) }, { label: quiz.title, onClick: () => props.onRouteChange(backRoute) }]} title={`Letter ${draft?.letter ?? question.label}`} description={`${quiz.language === "vi" ? "Vietnamese" : "English"} alphabet · questions/`} titleAction={<Button className="ui-page-header-folder" icon={<FolderOpen />} variant="icon" aria-label="Show letter in folder" onClick={() => void window.getgo.showInFolder(question.filePath)} />} navigation={<QuestionNavigator value={question.id} disabled={saving} items={ordered.map((item) => ({ value: item.id, label: `Letter ${item.label}`, reviewed: item.status === "reviewed" }))} onValueChange={(id) => props.onRouteChange(`/topics/${topic.id}/quizzes/${quiz.id}/questions/${id}?tab=${tab}`)} />} actions={<><SegmentedControl className="question-review-control" ariaLabel="Letter status" value={draft?.status === "verified" ? "verified" : draft?.status === "rejected" ? "rejected" : "pending"} disabled={!draft || saving} options={[{ value: "pending", label: "Pending" }, { value: "verified", label: "Reviewed" }, { value: "rejected", label: "Rejected" }]} onValueChange={(value) => { if (!draft) return; const next = { ...draft, status: value === "pending" ? undefined : value }; setDraft(next); void save(next); }} /><Button icon={<Save size={15} />} variant="solid" loading={saving} disabled={!dirty || saving} onClick={() => void save()}>Save</Button></>} />
    {error && <div className="error-banner"><strong>Editor error</strong><span>{error}</span></div>}
    {draft && <AlphabetLetterEditor locale={props.locale} speechSettings={props.speechSettings} manifestPath={quiz.filePath} dictionaryWords={dictionary.words} quizType={quiz.language === "vi" ? "alphabet-vietnamese" : "alphabet-english"} record={draft} tab={tab} onTabChange={(next) => { setTab(next); props.onRouteReplace(`/topics/${topic.id}/quizzes/${quiz.id}/questions/${question.id}?tab=${next}`); }} onSpeechSettingsChange={props.onSpeechSettingsChange} onChange={(next) => { if (next.type === "alphabet") setDraft(next); }} />}
  </section>;
}
