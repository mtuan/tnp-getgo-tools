import { CheckCheck, FolderOpen, ListOrdered, Plus, Trash2, Zap } from "lucide-react";
import type { QuizSummary } from "../../../../shared/domain/models";
import { QuizCrudDialog } from "../../components/CrudDialogs";
import { Button } from "../../../../shared/ui/Button";
import { PageHeader } from "../../../../shared/ui/PageHeader";
import { Tabs } from "../../../../shared/ui/Tabs";
import { DataTable, type DataColumn } from "../../../../shared/ui/DataTable";
import { ActionMenu } from "../../../../shared/ui/ActionMenu";
import { MarketplaceMetadataSection } from "../../components/MarketplaceMetadataSection";
import { AccordionGroup } from "../../../../shared/ui/Accordion";
import { MarketplaceStateCell } from "../../components/MarketplaceStateCell";
import { marketplaceTopicState } from "../../../../features/topics/domain/marketplace-topic-state";
import en from "../../../../shared/localization/en.json";
import vi from "../../../../shared/localization/vi.json";
import { QuestionOrderActions, type QuestionListItem, type QuizDetailTab } from "./shared";
import { QuizSharedCodeTab } from "./QuizSharedCodeTab";

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
    setContestTab,
    setPendingQuestionNo,
    setQuestionDraftRecord,
    setQuestionOrder,
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
            <>
              {contentQuiz && (
                  <MarketplaceStateCell
                    locale={locale}
                    value={marketplaceTopicState(contentQuiz.marketplace)}
                    target="quizzes"
                    id={quiz.id}
                    topicId={quiz.contest}
                    api={managerApi}
                    quizReview={{
                      manifestPath: quiz.manifestPath,
                      reviewed: quiz.reviewedQuestionCount,
                      total: quiz.questionCount ?? questions.length,
                    }}
                    compact={false}
                    onSaved={(value) => toast.show({
                          title: marketplaceCopy.stateUpdated,
                          description: marketplaceCopy.stateUpdatedDescription.replace(
                            "{state}",
                            marketplaceCopy.states[value],
                          ),
                        })}
                    onError={(error) => toast.show({ title: marketplaceCopy.publishFailed, description: String(error), variant: "error" })}
                  />
              )}
              {quizTab === "info" ? <Button
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
                      setContestTab("quizzes");
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
                </Button> : quizTab === "dictionary" ? null : questionOrder ? (
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
                  {quiz.type === "contest"
                    ? "Add question"
                    : quiz.type === "pronunciation"
                      ? "Add pronunciation"
                      : "Add letter"}
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
            )}
            </>
          }
        />
        <Tabs<QuizDetailTab>
          variant="underline"
          className="contest-detail-tabs"
          ariaLabel="Quiz detail"
          value={quizTab}
          onChange={setQuizTab}
          items={[
            quiz.type === "contest" || quiz.type === "pronunciation"
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
            quiz.relativePath.startsWith("content-v2/") &&
            quiz.type === "contest"
              ? { id: "code" as const, label: "Code" }
              : null,
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
                  sharedCode: input.sharedCode,
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
                recordKey={`quiz:${quiz.contest}/${quiz.id}`}
                locale={locale}
                load={() => managerApi.loadContentV2Quiz(quiz.contest, quiz.id)}
                loadSubjectOptions={async () => {
                  const topic = await window.getgo.loadContentV2Topic(quiz.contest);
                  return topic.marketplace?.subjects ??
                    (topic.type === "competition" ? [topic.subject] : []);
                }}
                save={async (record) => {
                  if (!("topicId" in record)) throw new Error("Expected quiz metadata.");
                  await managerApi.saveContentV2Quiz(quiz.contest, record);
                }}
              />
            )}
          </AccordionGroup>
        )}
        {quizTab === "code" && quiz.relativePath.startsWith("content-v2/") && (
          <QuizSharedCodeTab
            key={`${quiz.key}:${quiz.sharedCode ?? ""}`}
            quiz={quiz}
            api={managerApi}
            onSnapshotChange={onSnapshotChange}
            onQuizChange={(updated) => setPage({ kind: "quiz", quiz: updated })}
            notify={(title, description, error) => toast.show({ title, description, ...(error ? { variant: "error" } : {}) })}
          />
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
                      const index = questions.findIndex(
                        (question) => question.number === item.number,
                      );
                      setSelectedQuestion(index);
                      setQuestionDraftRecord(structuredClone(item.record));
                      setPendingQuestionNo(item.number);
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
      </section>
    );

}
