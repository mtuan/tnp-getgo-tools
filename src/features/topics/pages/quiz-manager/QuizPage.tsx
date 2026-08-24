import type { Dispatch, SetStateAction } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Zap } from "lucide-react";
import type { QuizQuestionRecord, QuizSummary, RepositoryViewData } from "../../../../shared/domain/models";
import { questionHasDynamicParams } from "../../../../features/quiz-editor/domain/question-dynamics";
import { alphabetData } from "../../../../features/quiz-editor/domain/alphabet-question";
import { relatedAlphabetWords } from "../../../../features/quiz-editor/domain/alphabet-letter";
import { questionContainsImages } from "../../../../features/quiz-editor/domain/question-images";
import { questionIsVerified, questionStatus, withQuestionStatus } from "../../../../features/quiz-editor/domain/question-status";
import type { DataColumn } from "../../../../shared/ui/DataTable";
import { TableActionButton } from "../../../../shared/ui/TableActionButton";
import { questionPrompt, type QuestionListItem } from "./shared";
import { renderActiveQuestion } from "./ActiveQuestionPage";
import { renderQuizOverview } from "./QuizOverviewPage";


type QuizPageContext = Record<string, any> & {
  page: { kind: "quiz"; quiz: QuizSummary };
  snapshot: RepositoryViewData;
  questionRecords: QuizQuestionRecord[];
  questionOrder: string[] | null;
  setQuestionOrder: Dispatch<SetStateAction<string[] | null>>;
  setQuestionRecords: Dispatch<SetStateAction<QuizQuestionRecord[]>>;
  setQuestionDraftRecord: Dispatch<SetStateAction<QuizQuestionRecord | null>>;
};

export function renderQuizPage(context: QuizPageContext) {
  const {
    alphabetDictionary,
    alphabetEditorTab,
    backToQuestions,
    buttonAction,
    contestRoute,
    draftMatchesSelection,
    goBack,
    lastSavedQuestion,
    locale,
    managerApi,
    onRouteChange,
    onSnapshotChange,
    onSpeechSettingsChange,
    page,
    previewQuestion,
    questionDraftRecord,
    questionEditorTab,
    questionOperation,
    questionOrder,
    questionRecords,
    quizInfoDirty,
    quizPublishCopy,
    quizTab,
    routeMode,
    runButtonAction,
    saving,
    savingVerification,
    selectedQuestion,
    sharedCodeDrawerOpen,
    setAlphabetEditorTab,
    setPage,
    setPendingQuestionNo,
    setPreviewQuestion,
    setQuestionDraftRecord,
    setQuestionEditorTab,
    setQuestionOperation,
    setQuestionOrder,
    setQuestionRecords,
    setQuizInfoDirty,
    setQuizTab,
    setSaving,
    setSavingVerification,
    setSelectedQuestion,
    setSharedCodeDrawerOpen,
    setSourceError,
    snapshot,
    sourceError,
    sourceLoading,
    speechSettings,
    toast,
    updateQuestionDraft,
  } = context;
    const { quiz } = page;
    const quizContest = snapshot.contests.find(
      (contest) => contest.id === quiz.contest,
    );
    const questions: QuestionListItem[] = questionRecords.map((record) => ({
      number: String(record.question_no),
      category: typeof record.category === "string" ? record.category : "—",
      prompt: record.authoringMode === "reference" && record.reference
        ? `References question ${record.reference.questionNo}`
        : questionPrompt(record.text_en ?? record.text_vn),
      dynamic: record.authoringMode === "reference"
        || questionHasDynamicParams(record.advancedDynamic),
      hasImages: questionContainsImages(record),
      reviewed: questionIsVerified(record),
      status: questionStatus(record),
      record,
    }));
    const displayedQuestions = questionOrder
      ? questionOrder
          .map((number) =>
            questions.find((question) => question.number === number),
          )
          .filter((question): question is QuestionListItem => Boolean(question))
      : questions;
    const questionOrderDirty = Boolean(
      questionOrder &&
      JSON.stringify(questionOrder) !==
        JSON.stringify(questions.map((question) => question.number)),
    );
    const saveQuestionOrder = () => {
      if (!questionOrder || !questionOrderDirty || buttonAction) return;
      void runButtonAction("save-question-order", async () => {
        const result = await managerApi.reorderQuizQuestions(
          quiz.manifestPath,
          questionOrder,
        );
        setQuestionRecords(result.questions);
        setQuestionOrder(null);
        onSnapshotChange(result.snapshot);
        toast.show({
          title: "Question order saved",
          description: "Only files inside questions/ were renumbered.",
        });
      });
    };
    const moveOrderedQuestion = (number: string, offset: -1 | 1) => {
      setQuestionOrder((current) => {
        if (!current) return current;
        const index = current.indexOf(number);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= current.length) return current;
        const next = [...current];
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      });
    };
    const moveOrderedQuestionTo = (fromIndex: number, toIndex: number) => {
      setQuestionOrder((current) => {
        if (
          !current ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= current.length ||
          toIndex >= current.length
        )
          return current;
        const next = [...current];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    };
    const verifiedCount = questions.filter(
      (question) => question.reviewed,
    ).length;
    const verificationTotal = questions.length || quiz.questionCount || 0;
    const displayedVerifiedCount = questions.length
      ? verifiedCount
      : quiz.reviewedQuestionCount;
    const markAllQuestionsReviewed = async () => {
      const pendingRecords = questionRecords.filter(
        (record) => !questionIsVerified(record),
      );
      if (!pendingRecords.length) return;
      const nextRecords = await managerApi.markAllQuizQuestionsReviewed(
        quiz.manifestPath,
      );
      const updatedQuiz = {
        ...quiz,
        reviewedQuestionCount: nextRecords.filter(questionIsVerified).length,
      };
      setQuestionRecords(nextRecords);
      setQuestionDraftRecord((current) =>
        current ? withQuestionStatus(current, "verified") : current,
      );
      setPage({ kind: "quiz", quiz: updatedQuiz });
      onSnapshotChange({
        ...snapshot,
        quizzes: snapshot.quizzes.map((item) =>
          item.key === quiz.key ? updatedQuiz : item,
        ),
      });
      toast.show({
        title: quizPublishCopy.markAllReviewedSuccess,
        description: quizPublishCopy.markAllReviewedDescription.replace(
          "{count}",
          String(pendingRecords.length),
        ),
      });
    };
    const questionColumns: DataColumn<QuestionListItem>[] = [
      {
        key: "number",
        title: "Question",
        width: 100,
        render: (item) => <strong>#{item.number}</strong>,
      },
      {
        key: "category",
        title: "Category",
        width: "24%",
        render: (item) => item.category,
      },
      {
        key: "prompt",
        title: "Question text",
        render: (item) => (
          <span className="question-text">
            {item.prompt}
            {item.dynamic && <Zap aria-label="Dynamic question" />}
          </span>
        ),
      },
      {
        key: "images",
        title: "Images",
        width: 90,
        align: "center",
        render: (item) =>
          item.hasImages ? (
            <span className="question-image-indicator" title="Contains images">
              <Check aria-label="Contains images" />
            </span>
          ) : (
            <span className="question-image-empty" aria-label="No images">
              —
            </span>
          ),
      },
      {
        key: "status",
        title: `Status (${displayedVerifiedCount}/${verificationTotal})`,
        width: 140,
        render: (item) => (
          <span
            className={`badge question-status-${item.status.replace(/[^a-z0-9_-]/gi, "-")}`}
          >
            {item.status === "verified"
              ? "Reviewed"
              : item.status === "rejected"
                ? "Rejected"
                : item.status === "pending"
                  ? "Pending"
                  : item.status}
          </span>
        ),
      },
      ...(questionOrder
        ? [
            {
              key: "order",
              title: "Order",
              width: 100,
              align: "center" as const,
              render: (item: QuestionListItem) => {
                const index = questionOrder.indexOf(item.number);
                return (
                  <span className="question-order-actions">
                    <TableActionButton
                      variant="solid"
                      color="primary"
                      icon={<ArrowUp />}
                      disabled={index <= 0}
                      aria-label={`Move question ${item.number} up`}
                      title="Move up"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveOrderedQuestion(item.number, -1);
                      }}
                    />
                    <TableActionButton
                      variant="solid"
                      color="success"
                      icon={<ArrowDown />}
                      disabled={index < 0 || index >= questionOrder.length - 1}
                      aria-label={`Move question ${item.number} down`}
                      title="Move down"
                      onClick={(event) => {
                        event.stopPropagation();
                        moveOrderedQuestion(item.number, 1);
                      }}
                    />
                  </span>
                );
              },
            },
          ]
        : []),
      ...(!questionOrder
        ? [
            {
              key: "edit",
              title: "",
              width: 56,
              align: "center" as const,
              role: "actions" as const,
              render: (item: QuestionListItem) => (
                <TableActionButton
                  icon={<Pencil size={16} strokeWidth={2.25} />}
                  color="primary"
                  aria-label={`Edit question ${item.number}`}
                  title="Edit question"
                  onClick={(event) => {
                    event.stopPropagation();
                    const index = questions.findIndex(
                      (question) => question.number === item.number,
                    );
                    setSelectedQuestion(index);
                    setQuestionDraftRecord(structuredClone(item.record));
                    setPendingQuestionNo(item.number);
                  }}
                />
              ),
            },
          ]
        : []),
    ];
    const alphabetColumns: DataColumn<QuestionListItem>[] = [
      {
        key: "number",
        title: "Order",
        width: 90,
        sortValue: (item) => Number(item.number),
        render: (item) => <strong>#{item.number}</strong>,
      },
      {
        key: "letter",
        title: "Letter",
        width: 130,
        sortValue: (item) => alphabetData(item.record).letter,
        render: (item) => {
          const data = alphabetData(item.record);
          return (
            <strong className="alphabet-table-letter">
              {data.letter || "—"}
            </strong>
          );
        },
      },
      {
        key: "forms",
        title: "Forms",
        width: "24%",
        render: (item) => {
          const data = alphabetData(item.record);
          return (
            <span>
              {data.uppercase || "—"} · {data.lowercase || "—"}
            </span>
          );
        },
      },
      {
        key: "pronunciation",
        title: "Pronunciation",
        render: (item) => alphabetData(item.record).pronunciation || "—",
      },
      {
        key: "samples",
        title: "Words",
        width: 110,
        align: "center",
        render: (item) => {
          const letter = alphabetData(item.record).letter;
          const language = quiz.language === "vi" ? "Vietnamese" : "English";
          return relatedAlphabetWords(
            alphabetDictionary.words,
            letter,
            language,
          ).length;
        },
      },
      {
        key: "status",
        title: `Status (${displayedVerifiedCount}/${verificationTotal})`,
        width: 140,
        render: (item) => (
          <span
            className={`badge question-status-${item.status.replace(/[^a-z0-9_-]/gi, "-")}`}
          >
            {item.status === "verified"
              ? "Reviewed"
              : item.status === "rejected"
                ? "Rejected"
                : item.status === "pending"
                  ? "Pending"
                  : item.status}
          </span>
        ),
      },
      {
        key: "edit",
        title: "",
        width: 56,
        align: "center",
        role: "actions",
        render: (item) => (
          <TableActionButton
            icon={<Pencil size={16} strokeWidth={2.25} />}
            color="primary"
            aria-label={`Edit letter ${alphabetData(item.record).letter || item.number}`}
            title="Edit letter"
            onClick={(event) => {
              event.stopPropagation();
              const index = questions.findIndex(
                (question) => question.number === item.number,
              );
              setSelectedQuestion(index);
              setQuestionDraftRecord(structuredClone(item.record));
              setPendingQuestionNo(item.number);
            }}
          />
        ),
      },
    ];
    const createQuestion = async () => {
      const result = await managerApi.createQuizQuestion(quiz.manifestPath);
      const nextRecords = [...questionRecords, result.question];
      setQuestionRecords(nextRecords);
      onSnapshotChange(result.snapshot);
      const index = nextRecords.length - 1;
      setSelectedQuestion(index);
      setQuestionDraftRecord(structuredClone(result.question));
      setPendingQuestionNo(String(result.question.question_no));
      setQuestionEditorTab("static");
      setSourceError(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      toast.show({
        title: `Question ${result.question.question_no} created`,
        description: "A new file was added to questions/.",
      });
    };
    const activeQuestion =
      selectedQuestion === null ? null : questions[selectedQuestion];
    const activePage = renderActiveQuestion({
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
      sharedCodeDrawerOpen,
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
      setSharedCodeDrawerOpen,
      setSourceError,
      snapshot,
      sourceError,
      speechSettings,
      toast,
      updateQuestionDraft,
    });
    if (activePage) return activePage;
    return renderQuizOverview({
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
      quizInfoDirty,
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
      setQuizInfoDirty,
      setQuizTab,
      setSelectedQuestion,
      sourceError,
      sourceLoading,
      snapshot,
      toast,
      verifiedCount,
    });

}
