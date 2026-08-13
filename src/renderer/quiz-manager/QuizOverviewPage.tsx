import { CheckCheck, FolderOpen, ListOrdered, Plus, Trash2, Zap } from "lucide-react";
import type { QuizSummary } from "../../core/models";
import { QuizCrudDialog } from "../CrudDialogs";
import { QuestionListPreviewDrawer } from "../QuestionListPreviewDrawer";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { Tabs } from "../ui/Tabs";
import { DataTable, type DataColumn } from "../ui/DataTable";
import { ActionMenu } from "../ui/ActionMenu";
import { MarketplaceMetadataSection } from "../MarketplaceMetadataSection";
import { AccordionGroup } from "../ui/Accordion";
import { Select } from "../ui/Select";
import {
  marketplaceTopicState,
  withMarketplaceTopicState,
  type MarketplaceTopicState,
} from "../../core/marketplace-topic-state";
import en from "../locales/en.json";
import vi from "../locales/vi.json";
import { QuestionOrderActions, type QuestionListItem, type QuizDetailTab } from "./shared";

type QuizOverviewContext = Record<string, any> & {
  questions: QuestionListItem[];
  displayedQuestions: QuestionListItem[];
  questionColumns: DataColumn<QuestionListItem>[];
  alphabetColumns: DataColumn<QuestionListItem>[];
};

export function renderQuizOverview(context: QuizOverviewContext) {
  const {
    alphabetColumns,
    buttonAction,
    contestRoute,
    createQuestion,
    displayedQuestions,
    goBack,
    locale,
    managerApi,
    markAllQuestionsReviewed,
    moveOrderedQuestionTo,
    onRouteChange,
    onSnapshotChange,
    previewQuestion,
    questionColumns,
    questionOrder,
    questionOrderDirty,
    questions,
    quiz,
    quizContest,
    quizPublishCopy,
    quizTab,
    routeMode,
    runButtonAction,
    saveQuestionOrder,
    setPage,
    setPendingQuestionNo,
    setPreviewQuestion,
    setQuestionDraftRecord,
    setQuestionOrder,
    setQuestionRecords,
    setQuizTab,
    setSelectedQuestion,
    sourceError,
    sourceLoading,
    snapshot,
    toast,
    verifiedCount,
  } = context;
  const marketplaceCopy = (locale === "vi" ? vi : en).marketplaceManager;
  const contentQuiz = snapshot.contentV2.quizzes.find(
    (item: { topicId: string; id: string }) =>
      item.topicId === quiz.contest && item.id === quiz.id,
  );
    return (
      <section className="manager editor-page">
        <PageHeader
          eyebrow="Quiz detail"
          breadcrumbs={[
            {
              label: routeMode === "topics" ? "Topics" : "Contests",
              onClick: () => setPage({ kind: "contests" }),
            },
            {
              label: quizContest?.title ?? quiz.contest.toUpperCase(),
              onClick: goBack,
            },
          ]}
          title={quiz.title}
          description={`${quiz.id} · ${[quiz.grade && `Grade ${quiz.grade}`, quiz.round, quiz.year].filter(Boolean).join(" · ")}`}
          titleAction={
            <Button
              className="ui-page-header-folder"
              icon={<FolderOpen />}
              variant="icon"
              disabled={Boolean(buttonAction)}
              aria-label="Show quiz in folder"
              title="Show quiz in folder"
              onClick={() =>
                void runButtonAction("show-quiz-folder", () =>
                  managerApi.showInFolder(quiz.manifestPath),
                )
              }
            />
          }
          actions={
            quizTab === "info" ? (
              <>
                {contentQuiz && (
                  <Select
                    className="manager-market-state-select"
                    ariaLabel={marketplaceCopy.stateLabel}
                    value={marketplaceTopicState(contentQuiz.marketplace)}
                    disabled={Boolean(buttonAction)}
                    options={Object.entries(marketplaceCopy.states).map(
                      ([value, label]) => ({ value, label }),
                    )}
                    onValueChange={(value) =>
                      void runButtonAction("market-state", async () => {
                        const stored = await window.getgo.loadContentV2Quiz(
                          quiz.contest,
                          quiz.id,
                        );
                        const next = await window.getgo.saveContentV2Quiz(
                          quiz.contest,
                          {
                            ...stored,
                            marketplace: withMarketplaceTopicState(
                              stored.marketplace,
                              value as MarketplaceTopicState,
                            ),
                          },
                        );
                        onSnapshotChange(next);
                        toast.show({
                          title: marketplaceCopy.stateUpdated,
                          description: marketplaceCopy.stateUpdatedDescription.replace(
                            "{state}",
                            marketplaceCopy.states[value as MarketplaceTopicState],
                          ),
                        });
                      })
                    }
                  />
                )}
                <Button
                  icon={<Trash2 size={15} />}
                  loading={buttonAction === "delete-quiz"}
                  variant="solid"
                  color="danger"
                  disabled={Boolean(buttonAction)}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete ${quiz.title}? This will move the quiz folder to Trash.`,
                      )
                    )
                      return;
                    void runButtonAction("delete-quiz", async () => {
                      const next = await managerApi.deleteQuiz(
                        quiz.manifestPath,
                      );
                      const parentRoute = contestRoute(quiz.contest);
                      onRouteChange(parentRoute);
                      setPage({ kind: "contest", contest: quiz.contest });
                      onSnapshotChange(next);
                      toast.show({
                        title: "Quiz deleted",
                        description: `${quiz.title} was moved to Trash.`,
                      });
                    });
                  }}
                >
                  Delete quiz
                </Button>
              </>
            ) : quizTab === "dictionary" ? null : questionOrder ? (
              <QuestionOrderActions
                dirty={questionOrderDirty}
                busy={Boolean(buttonAction)}
                onCancel={() => setQuestionOrder(null)}
                onSave={saveQuestionOrder}
              />
            ) : (
              <>
                <Button
                  icon={<Plus size={15} />}
                  variant="solid"
                  loading={buttonAction === "create-question"}
                  disabled={sourceLoading || Boolean(buttonAction)}
                  onClick={() =>
                    void runButtonAction("create-question", createQuestion)
                  }
                >
                  {quiz.type === "contest" ? "Add question" : "Add letter"}
                </Button>
                <ActionMenu
                  label={quizPublishCopy.more}
                  disabled={sourceLoading || Boolean(buttonAction)}
                  items={[
                    {
                      id: "mark-all-reviewed",
                      label: quizPublishCopy.markAllReviewed,
                      icon: CheckCheck,
                      disabled:
                        questions.length === 0 ||
                        verifiedCount === questions.length,
                      onSelect: () =>
                        void runButtonAction(
                          "mark-all-reviewed",
                          markAllQuestionsReviewed,
                        ),
                    },
                    {
                      id: "reorder",
                      label: "Reorder questions",
                      icon: ListOrdered,
                      disabled: questions.length < 2,
                      onSelect: () =>
                        setQuestionOrder(
                          questions.map((question) => question.number),
                        ),
                    },
                    ...(quiz.type === "contest"
                      ? [
                          {
                            id: "ai-migrate",
                            label: "AI migrate",
                            icon: Zap,
                            onSelect: () =>
                              void runButtonAction("ai-migrate", async () => {
                                const job =
                                  await managerApi.startAiMigrationJob({
                                    manifestPath: quiz.manifestPath,
                                    context: {
                                      contestId: quiz.contest,
                                      quizId: quiz.id,
                                      title: quiz.title,
                                      year: quiz.year,
                                      grade: quiz.grade,
                                      round: quiz.round,
                                    },
                                  });
                                toast.show({
                                  title: "AI migration queued",
                                  description: `${job.quizTitle} was added to Jobs.`,
                                });
                              }),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            )
          }
        />
        <Tabs<QuizDetailTab>
          variant="underline"
          className="contest-detail-tabs"
          ariaLabel="Quiz detail"
          value={quizTab}
          onChange={setQuizTab}
          items={[
            quiz.type === "contest"
              ? {
                  id: "questions" as const,
                  label: "Questions",
                }
              : quiz.type === "alphabet"
                ? {
                    id: "alphabets" as const,
                    label: "Alphabets",
                  }
                : null,
            { id: "info" as const, label: "Info" },
          ].filter((item): item is Exclude<typeof item, null> => Boolean(item))}
        />
        {quizTab === "info" && quizContest && (
          <AccordionGroup defaultExpanded="general">
            <QuizCrudDialog
              embedded
              quiz={quiz}
              contest={quizContest}
              onClose={() => undefined}
              onSaved={async (input) => {
                const next = await managerApi.updateQuiz(quiz.manifestPath, {
                  title: input.title,
                  icon: input.icon,
                  type: input.type,
                  language: input.language,
                  grade: input.grade,
                  round: input.round,
                  year: input.year,
                  status: input.status,
                  quizBuilderApiVersion: input.quizBuilderApiVersion,
                });
                onSnapshotChange(next);
                const updated = next.quizzes.find(
                  (item: QuizSummary) => item.key === quiz.key,
                );
                if (updated) setPage({ kind: "quiz", quiz: updated });
                toast.show({
                  title: "Quiz updated",
                  description: `${input.title} was saved.`,
                });
              }}
            />
            {quizContest.settingsPath.includes("content-v2") && (
              <MarketplaceMetadataSection
                locale={locale}
                load={() => window.getgo.loadContentV2Quiz(quiz.contest, quiz.id)}
                loadSubjectOptions={async () => {
                  const topic = await window.getgo.loadContentV2Topic(quiz.contest);
                  return topic.marketplace?.subjects ??
                    (topic.type === "competition" ? [topic.subject] : []);
                }}
                save={async (record) => {
                  if (!("topicId" in record)) throw new Error("Expected quiz metadata.");
                  const next = await window.getgo.saveContentV2Quiz(quiz.contest, record);
                  onSnapshotChange(next);
                }}
              />
            )}
          </AccordionGroup>
        )}
        {quizTab === "questions" && (
          <>
            {sourceError && (
              <div className="error-banner">
                <strong>Editor error</strong>
                <span>{sourceError}</span>
              </div>
            )}
            <DataTable
              horizontalScroll
              ariaLabel="Quiz questions"
              rows={displayedQuestions}
              columns={questionColumns}
              rowKey={(item, index) => `${item.number}-${index}`}
              emptyText={
                sourceLoading
                  ? "Loading questions…"
                  : quiz.questionStorageVersion === "questions-v1"
                    ? "No questions yet. Use Add question to create one."
                    : "No questions could be loaded from the legacy quiz source."
              }
              onRowClick={
                questionOrder
                  ? undefined
                  : (item) => {
                      if (item.record.type !== "alphabet")
                        setPreviewQuestion(item.record);
                    }
              }
              onRowMove={questionOrder ? moveOrderedQuestionTo : undefined}
            />
          </>
        )}
        {quizTab === "alphabets" && (
          <>
            {sourceError && (
              <div className="error-banner">
                <strong>Editor error</strong>
                <span>{sourceError}</span>
              </div>
            )}
            <DataTable
              horizontalScroll
              ariaLabel="Alphabet letters"
              rows={questions}
              columns={alphabetColumns}
              defaultSort={{ key: "letter" }}
              sortLocale={quiz.language ?? "en"}
              rowKey={(item, index) => `${item.number}-${index}`}
              emptyText={
                sourceLoading
                  ? "Loading letters…"
                  : "No letters yet. Use Add letter to create one."
              }
              onRowClick={(item) => {
                const index = questions.findIndex(
                  (question) => question.number === item.number,
                );
                setSelectedQuestion(index);
                setQuestionDraftRecord(structuredClone(item.record));
                setPendingQuestionNo(item.number);
              }}
            />
          </>
        )}
        {quiz.type === "contest" && previewQuestion && (
          <QuestionListPreviewDrawer
            record={previewQuestion}
            manifestPath={quiz.manifestPath}
            onClose={() => setPreviewQuestion(null)}
            onDelete={async () => {
              const result = await managerApi.deleteQuizQuestion(
                quiz.manifestPath,
                String(previewQuestion.question_no),
              );
              setQuestionRecords(result.questions);
              onSnapshotChange(result.snapshot);
              setPreviewQuestion(null);
              toast.show({
                title: "Question deleted",
                description:
                  "The question was removed from questions/ and remaining question numbers were updated.",
              });
            }}
          />
        )}
      </section>
    );

}
