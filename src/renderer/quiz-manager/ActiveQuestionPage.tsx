import { Check, CircleCheck, CircleDashed, CircleX, FolderOpen, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { ContestQuizQuestionRecord, QuizQuestionRecord, RepositorySnapshot } from "../../core/models";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { alphabetData } from "../../core/alphabet-question";
import { questionIsVerified, questionStatus, withQuestionStatus } from "../../core/question-status";
import { QuestionEditorTabs } from "../QuestionEditorTabs";
import { Button } from "../ui/Button";
import { PageHeader } from "../ui/PageHeader";
import { QuestionNavigator } from "../ui/QuestionNavigator";
import { ActionMenu } from "../ui/ActionMenu";
import { AlphabetLetterEditor } from "../AlphabetLetterEditor";
import { QuestionEditorKeyboardShortcuts, comparableQuestion, questionDiff, type QuestionListItem } from "./shared";

type ActiveQuestionContext = Record<string, any> & {
  questionRecords: QuizQuestionRecord[];
  questions: QuestionListItem[];
  snapshot: RepositorySnapshot;
  setQuestionRecords: Dispatch<SetStateAction<QuizQuestionRecord[]>>;
  setQuestionDraftRecord: Dispatch<SetStateAction<QuizQuestionRecord | null>>;
  lastSavedQuestion: MutableRefObject<QuizQuestionRecord | null>;
};

export function renderActiveQuestion(context: ActiveQuestionContext) {
  const {
    activeQuestion,
    alphabetDictionary,
    alphabetEditorTab,
    backToQuestions,
    buttonAction,
    createQuestion,
    draftMatchesSelection,
    goBack,
    lastSavedQuestion,
    locale,
    managerApi,
    onSnapshotChange,
    onSpeechSettingsChange,
    questionDraftRecord,
    questionEditorTab,
    questionOperation,
    questionRecords,
    questions,
    quiz,
    quizContest,
    routeMode,
    runButtonAction,
    saving,
    savingVerification,
    selectedQuestion,
    setAlphabetEditorTab,
    setPage,
    setPendingQuestionNo,
    setQuestionDraftRecord,
    setQuestionEditorTab,
    setQuestionOperation,
    setQuestionRecords,
    setSaving,
    setSavingVerification,
    setSelectedQuestion,
    setSourceError,
    snapshot,
    sourceError,
    speechSettings,
    toast,
    updateQuestionDraft,
  } = context;
    if (activeQuestion) {
      const questionHasChanges =
        draftMatchesSelection &&
        JSON.stringify(comparableQuestion(questionDraftRecord)) !==
          JSON.stringify(comparableQuestion(activeQuestion.record));
      const navigateQuestion = (value: string) => {
        const nextIndex = Number(value);
        if (
          !Number.isInteger(nextIndex) ||
          nextIndex < 0 ||
          nextIndex >= questions.length ||
          nextIndex === selectedQuestion
        )
          return;
        const hasUnsavedChanges =
          draftMatchesSelection &&
          JSON.stringify(comparableQuestion(questionDraftRecord)) !==
            JSON.stringify(comparableQuestion(activeQuestion.record));
        if (
          hasUnsavedChanges &&
          !window.confirm("Discard unsaved changes and open another question?")
        )
          return;
        const nextQuestion = questions[nextIndex];
        console.info("[GetGo Tools][Question navigation]", {
          fromQuestionNo: String(activeQuestion.number),
          toQuestionNo: String(nextQuestion.number),
          unsavedChanges: hasUnsavedChanges,
          initializedFromStoredRecord: true,
        });
        setSelectedQuestion(nextIndex);
        setQuestionDraftRecord(structuredClone(nextQuestion.record));
        setPendingQuestionNo(nextQuestion.number);
        setSourceError(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
      const updateReviewedCount = (
        wasVerified: boolean,
        isVerified: boolean,
      ) => {
        if (wasVerified === isVerified) return;
        const currentReviewed =
          questionRecords.filter(questionIsVerified).length;
        const reviewedQuestionCount = Math.max(
          0,
          Math.min(
            quiz.questionCount ?? Number.MAX_SAFE_INTEGER,
            currentReviewed + (isVerified ? 1 : -1),
          ),
        );
        onSnapshotChange({
          ...snapshot,
          quizzes: snapshot.quizzes.map((item) =>
            item.key === quiz.key ? { ...item, reviewedQuestionCount } : item,
          ),
        });
      };
      const saveQuestion = async () => {
        if (
          !questionDraftRecord ||
          !questionHasChanges ||
          saving ||
          savingVerification
        )
          return;
        setSaving(true);
        setQuestionOperation("save");
        setSourceError(null);
        try {
          console.info("[GetGo Tools][Question save][request]", {
            questionNo: questionDraftRecord.question_no,
            dirty: questionDiff(activeQuestion.record, questionDraftRecord),
          });
          const savedQuestion = await managerApi.saveQuizQuestion(
            quiz.manifestPath,
            questionDraftRecord,
          );
          console.info("[GetGo Tools][Question save][persisted]", {
            questionNo: savedQuestion.question_no,
            formattingChanges: questionDiff(questionDraftRecord, savedQuestion),
          });
          lastSavedQuestion.current = savedQuestion;
          setQuestionDraftRecord(savedQuestion);
          setQuestionRecords((current) =>
            current.map((item) =>
              String(item.question_no) === String(savedQuestion.question_no)
                ? savedQuestion
                : item,
            ),
          );
          updateReviewedCount(
            questionIsVerified(activeQuestion.record),
            questionIsVerified(savedQuestion),
          );
          toast.show({
            title: `Question ${savedQuestion.question_no} saved`,
            description: "The formatted question file was updated.",
          });
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          setSourceError(message);
          toast.show({
            title: "Could not save question",
            description: message,
            variant: "error",
          });
        } finally {
          setSaving(false);
          setQuestionOperation(null);
        }
      };
      const resetQuestion = async () => {
        if (
          !questionDraftRecord ||
          saving ||
          savingVerification ||
          !window.confirm(
            "Reset this question to its default generated TypeScript? This will remove all AI-generated code and AI response history.",
          )
        )
          return;
        setSaving(true);
        setQuestionOperation("reset");
        setSourceError(null);
        try {
          const reset = await managerApi.resetQuizQuestion(
            quiz.manifestPath,
            questionDraftRecord,
          );
          setQuestionDraftRecord(reset);
          setQuestionRecords((current) =>
            current.map((item) =>
              String(item.question_no) === String(reset.question_no)
                ? reset
                : item,
            ),
          );
          toast.show({
            title: `Question ${reset.question_no} reset`,
            description:
              "Default TypeScript was restored and AI data was removed.",
          });
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          setSourceError(message);
          toast.show({
            title: "Could not reset question",
            description: message,
            variant: "error",
          });
        } finally {
          setSaving(false);
          setQuestionOperation(null);
        }
      };
      const setQuestionReviewStatus = async (status: string) => {
        if (!questionDraftRecord || saving || savingVerification) return;
        const previousRecord = questionDraftRecord;
        const previousVerified = questionIsVerified(previousRecord);
        const nextRecord = withQuestionStatus(activeQuestion.record, status);
        setQuestionDraftRecord((current) =>
          current ? withQuestionStatus(current, status) : current,
        );
        setSavingVerification(true);
        try {
          const savedQuestion = await managerApi.saveQuizQuestion(
            quiz.manifestPath,
            nextRecord,
          );
          setQuestionRecords((current) =>
            current.map((item) =>
              String(item.question_no) === String(savedQuestion.question_no)
                ? savedQuestion
                : item,
            ),
          );
          setQuestionDraftRecord((current) =>
            current
              ? withQuestionStatus(current, questionStatus(savedQuestion))
              : current,
          );
          updateReviewedCount(
            previousVerified,
            questionIsVerified(savedQuestion),
          );
          const label =
            status === "verified"
              ? "Reviewed"
              : status === "rejected"
                ? "Rejected"
                : "Pending";
          toast.show({
            title: `Question marked ${label.toLowerCase()}`,
            description: `Question ${savedQuestion.question_no} review status was updated.`,
          });
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          setQuestionDraftRecord(previousRecord);
          toast.show({
            title: "Could not update question status",
            description: message,
            variant: "error",
          });
        } finally {
          setSavingVerification(false);
        }
      };
      const saveQuestionFeedback = async (
        feedback: Omit<
          NonNullable<QuizQuestionRecord["feedback"]>,
          "updatedAt"
        > | null,
      ) => {
        const nextRecord = { ...activeQuestion.record };
        if (feedback)
          nextRecord.feedback = {
            ...feedback,
            updatedAt: new Date().toISOString(),
          };
        else delete nextRecord.feedback;
        const savedQuestion = await managerApi.saveQuizQuestion(
          quiz.manifestPath,
          nextRecord,
        );
        setQuestionRecords((current) =>
          current.map((item) =>
            String(item.question_no) === String(savedQuestion.question_no)
              ? savedQuestion
              : item,
          ),
        );
        setQuestionDraftRecord((current) => {
          if (
            !current ||
            String(current.question_no) !== String(savedQuestion.question_no)
          )
            return current;
          const next: QuizQuestionRecord = { ...current };
          if (savedQuestion.feedback) next.feedback = savedQuestion.feedback;
          else delete next.feedback;
          return next;
        });
        toast.show({
          title: feedback
            ? "Question feedback saved"
            : "Question feedback cleared",
          description: `Question ${savedQuestion.question_no} was updated.`,
        });
      };
      const isAlphabetQuestion = questionDraftRecord?.type === "alphabet";
      const letter = questionDraftRecord
        ? alphabetData(questionDraftRecord).letter
        : "";
      const createNewQuestionFromDetail = () => {
        if (
          questionHasChanges &&
          !window.confirm("Discard unsaved changes and create a new question?")
        )
          return;
        void runButtonAction("create-question", createQuestion);
      };
      const discardQuestionChanges = () => {
        if (!questionHasChanges || saving || savingVerification) return;
        setQuestionDraftRecord(structuredClone(activeQuestion.record));
        setSourceError(null);
        toast.show({
          title: "Changes discarded",
          description: `Question ${activeQuestion.number} was restored to its last saved state.`,
        });
      };
      const deleteQuestionFromDetail = () => {
        const kind = isAlphabetQuestion ? "letter" : "question";
        if (
          !window.confirm(
            `Delete ${kind} ${activeQuestion.number}? This removes its file and renumbers the remaining questions.`,
          )
        )
          return;
        void runButtonAction("delete-question", async () => {
          const result = await managerApi.deleteQuizQuestion(
            quiz.manifestPath,
            String(activeQuestion.number),
          );
          setQuestionRecords(result.questions);
          onSnapshotChange(result.snapshot);
          setQuestionDraftRecord(null);
          setSourceError(null);
          backToQuestions();
          toast.show({
            title: isAlphabetQuestion ? "Letter deleted" : "Question deleted",
            description:
              "The file was removed from questions/ and remaining question numbers were updated.",
          });
        });
      };
      return (
        <section className="manager editor-page question-detail-page">
          <QuestionEditorKeyboardShortcuts
            saveDisabled={!questionHasChanges || saving || savingVerification}
            newQuestionDisabled={
              saving || savingVerification || Boolean(buttonAction)
            }
            onSave={() => void saveQuestion()}
            onNewQuestion={createNewQuestionFromDetail}
          />
          <PageHeader
            eyebrow={isAlphabetQuestion ? "Letter editor" : "Question editor"}
            breadcrumbs={[
              {
                label: routeMode === "topics" ? "Topics" : "Contests",
                onClick: () => setPage({ kind: "contests" }),
              },
              {
                label: quizContest?.title ?? quiz.contest.toUpperCase(),
                onClick: goBack,
              },
              { label: quiz.title, onClick: backToQuestions },
            ]}
            title={
              isAlphabetQuestion
                ? `Letter ${letter || activeQuestion.number}`
                : `Question ${activeQuestion.number}`
            }
            description={
              isAlphabetQuestion
                ? `${quiz.language === "vi" ? "Vietnamese" : "English"} alphabet · questions/`
                : `${activeQuestion.category} · questions/`
            }
            titleAction={
              <Button
                className="ui-page-header-folder"
                icon={<FolderOpen />}
                variant="icon"
                disabled={Boolean(buttonAction)}
                aria-label="Show question in folder"
                title="Show question in folder"
                onClick={() =>
                  void runButtonAction("show-question-folder", () =>
                    managerApi.showQuizQuestionInFolder(
                      quiz.manifestPath,
                      activeQuestion.number,
                    ),
                  )
                }
              />
            }
            navigation={
              <QuestionNavigator
                value={String(selectedQuestion)}
                disabled={saving || savingVerification}
                items={questions.map((question, index) => ({
                  value: String(index),
                  label: isAlphabetQuestion
                    ? `Letter ${alphabetData(question.record).letter || question.number}`
                    : `Question ${question.number}`,
                  description: isAlphabetQuestion
                    ? undefined
                    : question.category === "—"
                      ? undefined
                      : question.category,
                  reviewed: question.reviewed,
                }))}
                onValueChange={navigateQuestion}
              />
            }
            actions={
              <>
                <Button
                  icon={<RotateCcw size={15} />}
                  variant="outline"
                  disabled={!questionHasChanges || saving || savingVerification}
                  onClick={discardQuestionChanges}
                >
                  Discard
                </Button>
                <Button
                  icon={<Save size={15} />}
                  loading={questionOperation === "save"}
                  variant="solid"
                  disabled={!questionHasChanges || saving || savingVerification}
                  onClick={() => void saveQuestion()}
                >
                  Save
                </Button>
                <ActionMenu
                  label="More"
                  iconOnly
                  disabled={
                    saving || savingVerification || Boolean(buttonAction)
                  }
                  items={[
                    {
                      id: "new-question",
                      label: isAlphabetQuestion ? "New letter" : "New question",
                      icon: Plus,
                      onSelect: createNewQuestionFromDetail,
                    },
                    ...(!isAlphabetQuestion
                      ? [
                          {
                            id: "reset-question",
                            label: "Reset question",
                            icon: RotateCcw,
                            disabled: !questionDraftRecord?.advancedDynamic,
                            onSelect: () => void resetQuestion(),
                          },
                        ]
                      : []),
                    {
                      id: "delete-question",
                      label: isAlphabetQuestion
                        ? "Delete letter"
                        : "Delete question",
                      icon: Trash2,
                      onSelect: deleteQuestionFromDetail,
                    },
                    {
                      id: "review-status-label",
                      label: "Review status",
                      type: "label" as const,
                      onSelect: () => undefined,
                    },
                    {
                      id: "status-pending",
                      label: "Pending",
                      icon: CircleDashed,
                      trailingIcon:
                        questionStatus(questionDraftRecord!) === "pending"
                          ? Check
                          : undefined,
                      onSelect: () => void setQuestionReviewStatus("pending"),
                    },
                    {
                      id: "status-reviewed",
                      label: "Reviewed",
                      icon: CircleCheck,
                      trailingIcon:
                        questionStatus(questionDraftRecord!) === "verified"
                          ? Check
                          : undefined,
                      onSelect: () => void setQuestionReviewStatus("verified"),
                    },
                    {
                      id: "status-rejected",
                      label: "Rejected",
                      icon: CircleX,
                      trailingIcon:
                        questionStatus(questionDraftRecord!) === "rejected"
                          ? Check
                          : undefined,
                      onSelect: () => void setQuestionReviewStatus("rejected"),
                    },
                  ]}
                />
              </>
            }
          />
          {sourceError && (
            <div className="error-banner">
              <strong>Editor error</strong>
              <span>{sourceError}</span>
            </div>
          )}
          {questionDraftRecord &&
            (isAlphabetQuestion ? (
              <AlphabetLetterEditor
                locale={locale}
                speechSettings={speechSettings}
                manifestPath={quiz.manifestPath}
                dictionaryWords={alphabetDictionary.words}
                language={quiz.language ?? "en"}
                record={questionDraftRecord}
                tab={alphabetEditorTab}
                onTabChange={setAlphabetEditorTab}
                onSpeechSettingsChange={onSpeechSettingsChange}
                onChange={(next) =>
                  updateQuestionDraft(
                    String(questionDraftRecord.question_no),
                    next,
                  )
                }
              />
            ) : (
              <QuestionEditorTabs
                key={`${quiz.key}/${questionDraftRecord.question_no}`}
                tab={questionEditorTab}
                onTabChange={setQuestionEditorTab}
                record={questionDraftRecord as ContestQuizQuestionRecord}
                path={`${quiz.relativePath}/questions/q${questionDraftRecord.question_no}`}
                manifestPath={quiz.manifestPath}
                context={{
                  contestId: quiz.contest,
                  quizId: quiz.id,
                  title: quiz.title,
                  year: quiz.year,
                  grade: quiz.grade,
                  round: quiz.round,
                }}
                onChange={(next) =>
                  updateQuestionDraft(
                    String(questionDraftRecord.question_no),
                    next,
                  )
                }
                onSave={() => void saveQuestion()}
                onFeedbackSave={saveQuestionFeedback}
              />
            ))}
        </section>
      );
    }

  return null;
}
