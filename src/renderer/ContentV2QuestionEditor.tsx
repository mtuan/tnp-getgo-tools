import { useEffect, useMemo, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import type { ContentV2Question } from "../core/content-v2";
import type {
  AppSettings,
  ContestQuizQuestionRecord,
  ContentV2QuestionSummary,
  ContentV2QuizSummary,
  ContentV2TopicSummary,
  QuestionFeedback,
  RepositorySnapshot,
} from "../core/models";
import { QuestionEditorTabs, type QuestionEditorTab } from "./QuestionEditorTabs";
import { Button } from "./ui/Button";
import { PageHeader } from "./ui/PageHeader";
import { QuestionNavigator } from "./ui/QuestionNavigator";
import { SegmentedControl } from "./ui/SegmentedControl";

interface Props {
  locale: AppSettings["locale"];
  topic: ContentV2TopicSummary;
  quiz: ContentV2QuizSummary;
  question: ContentV2QuestionSummary;
  questions: ContentV2QuestionSummary[];
  route: string;
  onRouteChange(route: string): void;
  onRouteReplace(route: string): void;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onBackActionChange(action: (() => void) | null): void;
}

function questionNumber(question: ContentV2QuestionSummary): string {
  const match = question.id.match(/^q(\d+)$/i);
  return match?.[1] ?? String(question.order + 1);
}

function editorRecord(question: Extract<ContentV2Question, { type: "competition-question" }>): ContestQuizQuestionRecord {
  return {
    question_no: question.id.match(/^q(\d+)$/i)?.[1] ?? question.order + 1,
    ...(question.category ? { category: question.category } : {}),
    text_en: question.text.en,
    ...(question.text.vi !== undefined ? { text_vn: question.text.vi } : {}),
    image_datas: question.assets,
    answer: question.answer,
    ...(question.explanation ? { explanation: question.explanation } : {}),
    ...(question.dynamic
      ? { authoringMode: "advanced-dynamic", advancedDynamic: question.dynamic }
      : {}),
    ...(question.feedback ? { feedback: question.feedback } : {}),
    ...(question.status === "reviewed"
      ? { status: "verified" }
      : question.status === "rejected"
        ? { status: "rejected" }
        : {}),
  };
}

function collectAssets(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.startsWith("asset:")) result.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectAssets(item, result);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>))
      collectAssets(item, result);
  }
  return result;
}

function persistedQuestion(
  stored: Extract<ContentV2Question, { type: "competition-question" }>,
  draft: ContestQuizQuestionRecord,
): ContentV2Question {
  const status =
    draft.status === "verified"
      ? "reviewed"
      : draft.status === "rejected"
        ? "rejected"
        : "pending";
  const dynamic = draft.advancedDynamic;
  return {
    ...stored,
    status,
    category: typeof draft.category === "string" && draft.category
      ? draft.category
      : undefined,
    text: {
      en: (draft.text_en ?? "") as string | string[],
      ...(draft.text_vn ? { vi: draft.text_vn as string | string[] } : {}),
    },
    assets: [...collectAssets({ image_datas: draft.image_datas, answer: draft.answer })].sort(),
    answer: (draft.answer ?? {}) as Record<string, unknown>,
    ...(draft.explanation && typeof draft.explanation === "object"
      ? { explanation: draft.explanation as { en: string; vi?: string } }
      : { explanation: undefined }),
    ...(dynamic
      ? {
          dynamic: {
            paramsGeneratorTs: dynamic.paramsGeneratorTs,
            questionGeneratorTs: dynamic.questionGeneratorTs,
            originParamsTs: dynamic.originParamsTs,
            explanationGeneratorTs: dynamic.explanationGeneratorTs,
          },
        }
      : { dynamic: undefined }),
    ...(draft.feedback ? { feedback: draft.feedback } : { feedback: undefined }),
  };
}

export function ContentV2QuestionEditor({
  topic,
  quiz,
  question,
  questions,
  route,
  onRouteChange,
  onRouteReplace,
  onSnapshotChange,
  onBackActionChange,
}: Props) {
  const url = new URL(route, "app://getgo");
  const [tab, setTab] = useState<QuestionEditorTab>(
    url.searchParams.get("tab") === "dynamic" ? "dynamic" : "static",
  );
  const [stored, setStored] = useState<Extract<ContentV2Question, { type: "competition-question" }> | null>(null);
  const [draft, setDraft] = useState<ContestQuizQuestionRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backRoute = `/topics/${topic.id}/quizzes/${quiz.id}`;
  useEffect(() => {
    onBackActionChange(() => onRouteChange(backRoute));
    return () => onBackActionChange(null);
  }, [backRoute, onBackActionChange, onRouteChange]);
  useEffect(() => {
    let active = true;
    setError(null);
    setStored(null);
    setDraft(null);
    void window.getgo
      .loadContentV2Question(topic.id, quiz.id, question.id)
      .then((record) => {
        if (!active) return;
        if (record.type !== "competition-question")
          throw new Error("This editor only supports competition questions.");
        setStored(record);
        setDraft(editorRecord(record));
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)));
    return () => { active = false; };
  }, [question.id, quiz.id, topic.id]);
  const dirty = useMemo(
    () => Boolean(stored && draft && JSON.stringify(editorRecord(stored)) !== JSON.stringify(draft)),
    [draft, stored],
  );
  const save = async (nextDraft = draft) => {
    if (!stored || !nextDraft) return;
    setSaving(true);
    setError(null);
    try {
      const next = persistedQuestion(stored, nextDraft);
      const snapshot = await window.getgo.saveContentV2Question(topic.id, quiz.id, next);
      setStored(next as Extract<ContentV2Question, { type: "competition-question" }>);
      setDraft(editorRecord(next as Extract<ContentV2Question, { type: "competition-question" }>));
      onSnapshotChange(snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };
  const setReviewStatus = (value: string) => {
    if (!draft) return;
    const next = { ...draft };
    if (value === "pending") delete next.status;
    else next.status = value;
    setDraft(next);
    void save(next);
  };
  const ordered = [...questions].sort((a, b) => a.order - b.order);
  return (
    <section className="manager editor-page question-detail-page">
      <PageHeader
        eyebrow="Question editor"
        breadcrumbs={[
          { label: "Topics", onClick: () => onRouteChange("/topics") },
          { label: topic.title, onClick: () => onRouteChange(`/topics/${topic.id}`) },
          { label: quiz.title, onClick: () => onRouteChange(backRoute) },
        ]}
        title={`Question ${questionNumber(question)}`}
        description={`${question.label} · questions/`}
        titleAction={<Button className="ui-page-header-folder" icon={<FolderOpen />} variant="icon" aria-label="Show question in folder" title="Show question in folder" onClick={() => void window.getgo.showInFolder(question.filePath)} />}
        navigation={<QuestionNavigator value={question.id} disabled={saving} items={ordered.map((item) => ({ value: item.id, label: `Question ${questionNumber(item)}`, description: item.label, reviewed: item.status === "reviewed" }))} onValueChange={(id) => onRouteChange(`/topics/${topic.id}/quizzes/${quiz.id}/questions/${id}?tab=${tab}`)} />}
        actions={<><SegmentedControl className="question-review-control" ariaLabel="Question status" value={draft?.status === "verified" ? "verified" : draft?.status === "rejected" ? "rejected" : "pending"} disabled={!draft || saving} options={[{ value: "pending", label: "Pending" }, { value: "verified", label: "Reviewed" }, { value: "rejected", label: "Rejected" }]} onValueChange={setReviewStatus} /><Button icon={<Save size={15} />} variant="solid" loading={saving} disabled={!dirty || saving} onClick={() => void save()}>Save</Button></>}
      />
      {error && <div className="error-banner"><strong>Editor error</strong><span>{error}</span></div>}
      {draft && <QuestionEditorTabs key={`${topic.id}/${quiz.id}/${question.id}`} tab={tab} onTabChange={(next) => { setTab(next); onRouteReplace(`/topics/${topic.id}/quizzes/${quiz.id}/questions/${question.id}?tab=${next}`); }} record={draft} path={`content-v2/topics/${topic.id}/quizzes/${quiz.id}/questions/${question.id}`} manifestPath={quiz.filePath} context={{ topicId: topic.id, contestId: topic.id, quizId: quiz.id, title: quiz.title }} onChange={setDraft} onSave={() => void save()} onFeedbackSave={async (feedback: Omit<QuestionFeedback, "updatedAt"> | null) => { if (!draft) return; const next = { ...draft, ...(feedback ? { feedback: { ...feedback, updatedAt: new Date().toISOString() } } : {}) }; if (!feedback) delete next.feedback; setDraft(next); await save(next); }} />}
    </section>
  );
}
