import { useEffect, useMemo, useState } from "react";
import { CloudUpload, FolderOpen, Plus, Search } from "lucide-react";
import type {
  AppSettings,
  ContentV2QuestionSummary,
  ContentV2QuizSummary,
  ContentV2TopicSummary,
  RepositorySnapshot,
  SpeechLanguage,
  SpeechLanguageSettings,
} from "../core/models";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { ContentV2Editor } from "./ContentV2Editor";
import { Button } from "./ui/Button";
import { DataTable, type DataColumn } from "./ui/DataTable";
import { PageHeader } from "./ui/PageHeader";
import { useToast } from "./ui/Toast";
import { ContentV2CreateDialog } from "./ContentV2CreateDialog";
import { ContentV2QuestionEditor } from "./ContentV2QuestionEditor";
import { Tabs } from "./ui/Tabs";
import { ContentV2AlphabetEditor } from "./ContentV2AlphabetEditor";

interface Props {
  locale: AppSettings["locale"];
  speechSettings: AppSettings["speech"];
  snapshot: RepositorySnapshot;
  route: string;
  onRouteChange(route: string): void;
  onRouteReplace(route: string): void;
  onBackActionChange(action: (() => void) | null): void;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onSpeechSettingsChange(language: SpeechLanguage, settings: SpeechLanguageSettings): Promise<void>;
}

type Page =
  | { kind: "topics" }
  | { kind: "topic"; topic: ContentV2TopicSummary }
  | { kind: "quiz"; topic: ContentV2TopicSummary; quiz: ContentV2QuizSummary }
  | {
      kind: "question";
      topic: ContentV2TopicSummary;
      quiz: ContentV2QuizSummary;
      question: ContentV2QuestionSummary;
    };

function pageFromRoute(snapshot: RepositorySnapshot, route: string): Page {
  const parts = new URL(route, "app://getgo").pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const topic = snapshot.contentV2.topics.find((item) => item.id === parts[1]);
  if (!topic) return { kind: "topics" };
  const quiz = snapshot.contentV2.quizzes.find(
    (item) => item.topicId === topic.id && item.id === parts[3],
  );
  if (!quiz) return { kind: "topic", topic };
  const question = snapshot.contentV2.questions.find(
    (item) =>
      item.topicId === topic.id &&
      item.quizId === quiz.id &&
      item.id === parts[5],
  );
  return question
    ? { kind: "question", topic, quiz, question }
    : { kind: "quiz", topic, quiz };
}

function publishStatus(
  localHash: string,
  publishedHash: string | null,
): "not-published" | "published" | "changed" {
  return !publishedHash
    ? "not-published"
    : localHash === publishedHash
      ? "published"
      : "changed";
}

export function TopicsManager({
  locale,
  speechSettings,
  snapshot,
  route,
  onRouteChange,
  onRouteReplace,
  onBackActionChange,
  onSnapshotChange,
  onSpeechSettingsChange,
}: Props) {
  const toast = useToast();
  const copy = (locale === "vi" ? vi : en).contentV2;
  const [publishing, setPublishing] = useState(false);
  const [creating, setCreating] = useState<
    "topic" | "quiz" | "question" | null
  >(null);
  const [detailTab, setDetailTab] = useState<"items" | "info" | "publish">(
    () => {
      const tab = new URL(route, "app://getgo").searchParams.get("tab");
      return tab === "info" || tab === "publish" ? tab : "items";
    },
  );
  const [query, setQuery] = useState("");
  useEffect(() => {
    const tab = new URL(route, "app://getgo").searchParams.get("tab");
    setDetailTab(tab === "info" || tab === "publish" ? tab : "items");
    setQuery("");
  }, [route.split("?")[0]]);
  const page = pageFromRoute(snapshot, route);
  const go = (next: string) => onRouteChange(next);
  const back =
    page.kind === "question"
      ? () => go(`/topics/${page.topic.id}/quizzes/${page.quiz.id}`)
      : page.kind === "quiz"
        ? () => go(`/topics/${page.topic.id}`)
        : page.kind === "topic"
          ? () => go("/topics")
          : null;
  useEffect(() => {
    onBackActionChange(back);
    return () => onBackActionChange(null);
  });

  const topicColumns = useMemo<DataColumn<ContentV2TopicSummary>[]>(
    () => [
      {
        key: "title",
        title: copy.columns.topic,
        render: (item) => (
          <div className="topic-primary">
            <strong>{item.title}</strong>
            <small>{item.id}</small>
          </div>
        ),
      },
      {
        key: "quizzes",
        title: copy.columns.quizzes,
        align: "center",
        width: 110,
        render: (item) => item.quizCount,
      },
      {
        key: "reviewed",
        title: "Reviewed",
        width: 150,
        render: (item) => snapshot.contentV2.quizzes.filter((quiz) => quiz.topicId === item.id && quiz.status === "reviewed").length,
      },
      {
        key: "published",
        title: "Published",
        width: 150,
        render: (item) => <span className={`badge publishing-status-${publishStatus(item.localHash, item.publishedHash)}`}>{copy.publishStatuses[publishStatus(item.localHash, item.publishedHash)]}</span>,
      },
    ],
    [copy, snapshot.contentV2.quizzes],
  );
  const quizColumns = useMemo<DataColumn<ContentV2QuizSummary>[]>(
    () => [
      {
        key: "title",
        title: copy.columns.quiz,
        render: (item) => (
          <div className="topic-primary">
            <strong>{item.title}</strong>
            <small>{item.id}</small>
          </div>
        ),
      },
      {
        key: "grade",
        title: "Grade",
        render: (item) => item.type === "competition-paper" ? item.grade ?? "—" : item.language?.toUpperCase() ?? "—",
      },
      {
        key: "year-round",
        title: "Year / round",
        render: (item) => item.type === "competition-paper" ? <div className="topic-primary"><strong>{item.year}</strong><small>{item.round}</small></div> : "—",
      },
      {
        key: "questions",
        title: copy.columns.questions,
        align: "center",
        width: 130,
        render: (item) => item.questionCount,
      },
      {
        key: "reviewed",
        title: "Reviewed",
        width: 120,
        align: "center",
        render: (item) => <span className={`badge review-status ${item.questionCount > 0 && item.reviewedQuestionCount === item.questionCount ? "review-status-full" : item.reviewedQuestionCount > 0 ? "review-status-partial" : "review-status-none"}`}>{item.reviewedQuestionCount}/{item.questionCount}</span>,
      },
      {
        key: "status",
        title: "Status",
        width: 150,
        render: (item) => <span className={`badge question-status-${item.status}`}>{item.status}</span>,
      },
    ],
    [copy],
  );
  const questionColumns = useMemo<DataColumn<ContentV2QuestionSummary>[]>(
    () => [
      {
        key: "order",
        title: copy.columns.order,
        width: 90,
        align: "center",
        render: (item) => item.order + 1,
      },
      {
        key: "question",
        title: copy.columns.question,
        render: (item) => (
          <div className="topic-primary">
            <strong>{item.label}</strong>
            <small>{item.id}</small>
          </div>
        ),
      },
      {
        key: "category",
        title: "Category",
        render: (item) => item.category ?? "—",
      },
      {
        key: "dynamic",
        title: "Dynamic",
        width: 100,
        align: "center",
        render: (item) => item.dynamic ? "Yes" : "No",
      },
      {
        key: "images",
        title: "Images",
        width: 90,
        align: "center",
        render: (item) => item.hasImages ? "Yes" : "No",
      },
      {
        key: "review",
        title: copy.columns.review,
        width: 130,
        render: (item) => (
          <span className={`badge question-status-${item.status}`}>
            {item.status}
          </span>
        ),
      },
    ],
    [copy],
  );
  const alphabetQuestionColumns = useMemo<DataColumn<ContentV2QuestionSummary>[]>(
    () => [
      { key: "order", title: "Order", width: 90, align: "center", render: (item) => item.order + 1 },
      { key: "letter", title: "Letter", render: (item) => <div className="topic-primary"><strong>{item.label}</strong><small>{item.id}</small></div> },
      { key: "status", title: "Status", width: 130, render: (item) => <span className={`badge question-status-${item.status}`}>{item.status}</span> },
    ],
    [],
  );

  if (page.kind === "topics")
    return (
      <section className="manager topics-manager">
        <PageHeader
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
          actions={
            <Button
              icon={<Plus size={15} />}
              variant="solid"
              onClick={() => setCreating("topic")}
            >
              {copy.createTopic}
            </Button>
          }
        />
        {creating === "topic" && (
          <ContentV2CreateDialog
            locale={locale}
            selection={{ kind: "topic" }}
            nextOrder={snapshot.contentV2.topics.length}
            onClose={() => setCreating(null)}
            onSaved={(next) => {
              onSnapshotChange(next);
              setCreating(null);
            }}
          />
        )}
        <DataTable
          ariaLabel={copy.title}
          rows={snapshot.contentV2.topics}
          columns={topicColumns}
          rowKey={(item) => item.id}
          emptyText={copy.emptyTopics}
          onRowClick={(item) => go(`/topics/${item.id}`)}
        />
      </section>
    );

  const folderButton = (
    <Button
      className="ui-page-header-folder"
      icon={<FolderOpen />}
      variant="icon"
      aria-label={copy.openFolder}
      title={copy.openFolder}
      onClick={() =>
        void window.getgo.showInFolder(
          page.kind === "topic"
            ? page.topic.filePath
            : page.kind === "quiz"
              ? page.quiz.filePath
              : page.question.filePath,
        )
      }
    />
  );
  if (page.kind === "topic") {
    const rows = snapshot.contentV2.quizzes
      .filter((item) => item.topicId === page.topic.id)
      .filter((item) => `${item.title} ${item.id} ${item.grade ?? ""} ${item.year ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
    return (
      <section className="manager topics-manager">
        <PageHeader
          eyebrow={page.topic.type === "competition" ? "Quiz manager" : copy.topicDetail}
          breadcrumbs={[{ label: copy.title, onClick: () => go("/topics") }]}
          title={page.topic.title}
          description={`${snapshot.contentV2.quizzes.filter((item) => item.topicId === page.topic.id).length} quizzes in this ${page.topic.type === "competition" ? "contest" : "topic"}`}
          titleAction={folderButton}
          actions={
            <>
              {detailTab === "items" && <Button
                icon={<Plus size={15} />}
                variant="outline"
                color="neutral"
                onClick={() => setCreating("quiz")}
              >
                {copy.createQuiz}
              </Button>}
              <Button
                icon={<CloudUpload size={15} />}
                variant="solid"
                loading={publishing}
                onClick={() => {
                  setPublishing(true);
                  void window.getgo
                    .publishContentV2Topic(page.topic.id)
                    .then(async () => {
                      onSnapshotChange(await window.getgo.scanRepository());
                      toast.show({
                        title: copy.publishTopicSuccess,
                        description: copy.publishSuccessDescription,
                      });
                    })
                    .catch((cause) =>
                      toast.show({
                        title: copy.publishFailed,
                        description:
                          cause instanceof Error
                            ? cause.message
                            : String(cause),
                        variant: "error",
                      }),
                    )
                    .finally(() => setPublishing(false));
                }}
              >
                {page.topic.publishedHash
                  ? copy.republishTopic
                  : copy.publishTopic}
              </Button>
            </>
          }
        />
        <Tabs
          variant="underline"
          className="contest-detail-tabs"
          ariaLabel="Topic detail"
          value={detailTab === "publish" ? "items" : detailTab}
          onChange={(value) => setDetailTab(value)}
          items={[
            { id: "items" as const, label: "Quizzes", badge: snapshot.contentV2.quizzes.filter((item) => item.topicId === page.topic.id).length },
            { id: "info" as const, label: "Info" },
          ]}
        />
        {detailTab === "items" && <>
          <div className="manager-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quizzes…" /></div>
            <DataTable
              ariaLabel={copy.columns.quizzes}
              rows={rows}
              columns={quizColumns}
              rowKey={(item) => item.key}
              emptyText={copy.emptyQuizzes}
              onRowClick={(item) =>
                go(`/topics/${page.topic.id}/quizzes/${item.id}`)
              }
            />
        </>}
        {detailTab === "info" &&
          <ContentV2Editor
            locale={locale}
            selection={{ kind: "topic", topicId: page.topic.id }}
            onSnapshotChange={onSnapshotChange}
            onDeleted={(next) => {
              onSnapshotChange(next);
              go("/topics");
            }}
          />
        }
        {creating === "quiz" && (
          <ContentV2CreateDialog
            locale={locale}
            selection={{ kind: "quiz", topic: page.topic }}
            nextOrder={rows.length}
            onClose={() => setCreating(null)}
            onSaved={(next) => {
              onSnapshotChange(next);
              setCreating(null);
            }}
          />
        )}
      </section>
    );
  }
  if (page.kind === "quiz") {
    const rows = snapshot.contentV2.questions.filter(
      (item) => item.topicId === page.topic.id && item.quizId === page.quiz.id,
    );
    return (
      <section className="manager topics-manager">
        <PageHeader
          eyebrow="Quiz detail"
          breadcrumbs={[
            { label: copy.title, onClick: () => go("/topics") },
            {
              label: page.topic.title,
              onClick: () => go(`/topics/${page.topic.id}`),
            },
          ]}
          title={page.quiz.title}
          description={`${page.quiz.id} · ${page.quiz.type === "competition-paper" ? `Grade ${page.quiz.grade} · ${page.quiz.round} · ${page.quiz.year}` : copy.typeNames[page.quiz.type]}`}
          titleAction={folderButton}
          actions={
            <>
              {detailTab === "items" && <Button
                icon={<Plus size={15} />}
                variant="outline"
                color="neutral"
                onClick={() => setCreating("question")}
              >
                {copy.createQuestion}
              </Button>}
              {detailTab === "publish" && <Button
                icon={<CloudUpload size={15} />}
                variant="solid"
                loading={publishing}
                disabled={
                  page.quiz.questionCount !== page.quiz.reviewedQuestionCount
                }
                onClick={() => {
                  setPublishing(true);
                  void window.getgo
                    .publishContentV2Quiz(page.topic.id, page.quiz.id)
                    .then(async () => {
                      onSnapshotChange(await window.getgo.scanRepository());
                      toast.show({
                        title: copy.publishQuizSuccess,
                        description: copy.publishSuccessDescription,
                      });
                    })
                    .catch((cause) =>
                      toast.show({
                        title: copy.publishFailed,
                        description:
                          cause instanceof Error
                            ? cause.message
                            : String(cause),
                        variant: "error",
                      }),
                    )
                    .finally(() => setPublishing(false));
                }}
              >
                {page.quiz.publishedHash
                  ? copy.republishQuiz
                  : copy.publishQuiz}
              </Button>}
            </>
          }
        />
        <Tabs
          variant="underline"
          className="contest-detail-tabs"
          ariaLabel="Quiz detail"
          value={detailTab}
          onChange={(value) => setDetailTab(value)}
          items={[
            { id: "items" as const, label: page.quiz.type === "alphabet-course" ? "Alphabets" : "Questions", badge: rows.length },
            { id: "info" as const, label: "Info" },
            { id: "publish" as const, label: "Publish" },
          ]}
        />
        {detailTab === "items" &&
            <DataTable
              ariaLabel={copy.columns.questions}
              rows={rows}
              columns={page.quiz.type === "alphabet-course" ? alphabetQuestionColumns : questionColumns}
              rowKey={(item) => item.key}
              emptyText={copy.emptyQuestions}
              onRowClick={(item) =>
                go(
                  `/topics/${page.topic.id}/quizzes/${page.quiz.id}/questions/${item.id}`,
                )
              }
            />
        }
        {detailTab === "info" &&
          <ContentV2Editor
            locale={locale}
            selection={{
              kind: "quiz",
              topicId: page.topic.id,
              quizId: page.quiz.id,
            }}
            onSnapshotChange={onSnapshotChange}
            onDeleted={(next) => {
              onSnapshotChange(next);
              go(`/topics/${page.topic.id}`);
            }}
          />
        }
        {detailTab === "publish" && (
          <div className="quiz-publish-status-grid">
            <div><span>Status</span><strong>{publishStatus(page.quiz.localHash, page.quiz.publishedHash).replace("-", " ")}</strong></div>
            <div><span>Last published</span><strong>{page.quiz.publishedAt ? new Date(page.quiz.publishedAt).toLocaleString() : "Never"}</strong></div>
            <div><span>Questions</span><strong>{page.quiz.questionCount}</strong></div>
          </div>
        )}
        {creating === "question" && (
          <ContentV2CreateDialog
            locale={locale}
            selection={{ kind: "question", topic: page.topic, quiz: page.quiz }}
            nextOrder={rows.length}
            onClose={() => setCreating(null)}
            onSaved={(next) => {
              onSnapshotChange(next);
              setCreating(null);
            }}
          />
        )}
      </section>
    );
  }
  if (page.question.type === "competition-question")
    return (
      <ContentV2QuestionEditor
        locale={locale}
        topic={page.topic}
        quiz={page.quiz}
        question={page.question}
        questions={snapshot.contentV2.questions.filter((item) => item.topicId === page.topic.id && item.quizId === page.quiz.id)}
        route={route}
        onRouteChange={onRouteChange}
        onRouteReplace={onRouteReplace}
        onSnapshotChange={onSnapshotChange}
        onBackActionChange={onBackActionChange}
      />
    );
  if (page.question.type === "alphabet-letter")
    return (
      <ContentV2AlphabetEditor
        locale={locale}
        speechSettings={speechSettings}
        topic={page.topic}
        quiz={page.quiz}
        question={page.question}
        questions={snapshot.contentV2.questions.filter((item) => item.topicId === page.topic.id && item.quizId === page.quiz.id)}
        route={route}
        onRouteChange={onRouteChange}
        onRouteReplace={onRouteReplace}
        onSnapshotChange={onSnapshotChange}
        onBackActionChange={onBackActionChange}
        onSpeechSettingsChange={onSpeechSettingsChange}
      />
    );
  return (
    <section className="manager editor-page question-detail-page">
      <PageHeader
        eyebrow={copy.questionDetail}
        breadcrumbs={[
          { label: copy.title, onClick: () => go("/topics") },
          {
            label: page.topic.title,
            onClick: () => go(`/topics/${page.topic.id}`),
          },
          {
            label: page.quiz.title,
            onClick: () =>
              go(`/topics/${page.topic.id}/quizzes/${page.quiz.id}`),
          },
        ]}
        title={page.question.label}
        description={`${copy.typeNames[page.question.type]} · ${page.question.id}`}
        titleAction={folderButton}
      />
      <ContentV2Editor
        locale={locale}
        selection={{
          kind: "question",
          topicId: page.topic.id,
          quizId: page.quiz.id,
          questionId: page.question.id,
        }}
        onSnapshotChange={onSnapshotChange}
        onDeleted={(next) => {
          onSnapshotChange(next);
          go(`/topics/${page.topic.id}/quizzes/${page.quiz.id}`);
        }}
      />
    </section>
  );
}
