import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AiMigrationJob,
  AlphabetDictionary,
  KidLearningDictionary,
  ContestQuizQuestionRecord,
  ContestSummary,
  QuizAiMigrationJob,
  QuizMigrationResult,
  QuizQuestionRecord,
  QuizSummary,
} from "../../../shared/domain/models";
import { isCurrentQuestionDraftChange } from "../../../features/quiz-editor/domain/question-draft";
import { useToast } from "../../../shared/ui/Toast";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import type { QuestionEditorTab } from "../../quiz-editor/components/QuestionEditorTabs";
import type { AlphabetEditorTab } from "../../quiz-editor/components/AlphabetLetterEditor";
import {
  comparableQuestion,
  questionDiff,
  restoredPage,
  type ContestDetailTab,
  type ManagerPage,
  type QuizDetailTab,
  type QuizManagerProps,
} from "./quiz-manager/shared";
import { renderQuizPage } from "./quiz-manager/QuizPage";
import { renderManagerPage } from "./quiz-manager/ManagerPage";
import { useQuizMigrationActions } from "./quiz-manager/useQuizMigrationActions";
import { useTopicListFilters } from "./quiz-manager/useTopicListFilters";
import { useTopicsView } from "./quiz-manager/useTopicsView";

export type { QuizManagerApi } from "./quiz-manager/shared";
export function QuizManager({
  locale,
  speechSettings,
  snapshot,
  initialRoute,
  onSnapshotChange,
  onRouteChange,
  onOpenJobs,
  onBackActionChange,
  onSpeechSettingsChange,
  api,
  routeMode = "legacy",
}: QuizManagerProps) {
  const managerApi = api ?? window.getgo;
  const toast = useToast();
  const quizPublishCopy = (locale === "vi" ? vi : en).quizPublish;
  const [restored] = useState(() =>
    restoredPage(snapshot, initialRoute, routeMode),
  );
  const rootRoute = routeMode === "topics" ? "/topics" : "/quizzes/contests";
  const contestRoute = (contestId: string) =>
    `${rootRoute}/${encodeURIComponent(contestId)}`;
  const quizRoute = (contestId: string, quizId: string) =>
    `${contestRoute(contestId)}/quizzes/${encodeURIComponent(quizId)}`;
  const [page, setPage] = useState<ManagerPage>(restored.page);
  const loadedTopicRef = useRef<string | null>(null);
  useEffect(() => {
    if (routeMode !== "topics" || page.kind !== "contest" || !api?.loadTopicQuizzes)
      return;
    if (loadedTopicRef.current === page.contest) return;
    loadedTopicRef.current = page.contest;
    void api.loadTopicQuizzes(page.contest).catch(() => {
      loadedTopicRef.current = null;
    });
  }, [api, page, routeMode]);
  const [query, setQuery] = useState("");
  const [topicsView, setTopicsView] = useTopicsView();
  const [treeTopicQuizzes, setTreeTopicQuizzes] = useState<
    Record<string, QuizSummary[]>
  >({});
  const loadTreeTopicQuizzes = useCallback(
    async (topicId: string) => {
      if (treeTopicQuizzes[topicId]) return;
      const quizzes = api?.loadTopicQuizzes
        ? await api.loadTopicQuizzes(topicId)
        : snapshot.quizzes.filter((quiz) => quiz.contest === topicId);
      setTreeTopicQuizzes((current) =>
        current[topicId] ? current : { ...current, [topicId]: quizzes },
      );
    },
    [api, snapshot.quizzes, treeTopicQuizzes],
  );
  const [sourceLoading, setSourceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingVerification, setSavingVerification] = useState(false);
  const [questionOperation, setQuestionOperation] = useState<
    "save" | "reset" | null
  >(null);
  const [buttonAction, setButtonAction] = useState<string | null>(null);
  const [quizInfoDirty, setQuizInfoDirty] = useState(false);
  const [topicInfoDirty, setTopicInfoDirty] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [contestDialog, setContestDialog] = useState<
    ContestSummary | "create" | null
  >(null);
  const [quizDialog, setQuizDialog] = useState<QuizSummary | "create" | null>(
    null,
  );
  const [contestTab, setContestTab] = useState<ContestDetailTab>(() => {
    if (routeMode !== "topics" || !initialRoute) return "quizzes";
    try {
      const tab = new URL(initialRoute, "app://getgo").searchParams.get("tab");
      return tab === "info" ||
        tab === "dictionaries" ||
        tab === "assets"
        ? tab
        : tab === "marketplace" ? "info" : "quizzes";
    } catch {
      return "quizzes";
    }
  });
  const [quizTab, setQuizTab] = useState<QuizDetailTab>(restored.quizTab);
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [questionRecords, setQuestionRecords] = useState<QuizQuestionRecord[]>(
    [],
  );
  const [alphabetDictionary, setAlphabetDictionary] =
    useState<AlphabetDictionary>({ schemaVersion: 1, words: [] });
  const [topicDictionary, setTopicDictionary] = useState<KidLearningDictionary>(
    { schemaVersion: 2, entries: [] },
  );
  const [topicResourceError, setTopicResourceError] = useState<string | null>(
    null,
  );
  const [questionOrder, setQuestionOrder] = useState<string[] | null>(null);
  const [previewQuestion, setPreviewQuestion] =
    useState<ContestQuizQuestionRecord | null>(null);
  const [questionDraftRecord, setQuestionDraftRecord] =
    useState<QuizQuestionRecord | null>(null);
  const [pendingQuestionNo, setPendingQuestionNo] = useState(
    restored.questionNo,
  );
  const [questionEditorTab, setQuestionEditorTab] = useState<QuestionEditorTab>(
    restored.questionTab,
  );
  const [alphabetEditorTab, setAlphabetEditorTab] = useState<AlphabetEditorTab>(
    restored.alphabetTab,
  );
  const [migrationResults, setMigrationResults] = useState<{
    result: QuizMigrationResult;
    attempted: number;
  } | null>(null);
  const [migrationJobs, setMigrationJobs] = useState<AiMigrationJob[]>([]);
  const lastSavedQuestion = useRef<QuizQuestionRecord | null>(null);
  const previousSaveButtonState = useRef<{
    enabled: boolean;
    questionNo: string | null;
  } | null>(null);
  const storedQuestion =
    selectedQuestion === null
      ? null
      : (questionRecords[selectedQuestion] ?? null);
  const draftMatchesSelection = Boolean(
    storedQuestion &&
    questionDraftRecord &&
    String(storedQuestion.question_no) ===
      String(questionDraftRecord.question_no),
  );
  const saveButtonDirty = Boolean(
    draftMatchesSelection &&
    JSON.stringify(comparableQuestion(questionDraftRecord)) !==
      JSON.stringify(comparableQuestion(storedQuestion)),
  );
  const saveButtonEnabled = saveButtonDirty && !saving && !savingVerification;
  const updateQuestionDraft = useCallback(
    (originQuestionNo: string, next: QuizQuestionRecord) => {
      setQuestionDraftRecord((current) => {
        const currentQuestionNo = current ? String(current.question_no) : null;
        const nextQuestionNo = String(next.question_no);
        if (
          !isCurrentQuestionDraftChange(
            originQuestionNo,
            currentQuestionNo,
            nextQuestionNo,
          )
        ) {
          console.warn(
            "[GetGo Tools][Question draft][stale editor change rejected]",
            {
              originQuestionNo,
              currentQuestionNo,
              nextQuestionNo,
              reason:
                currentQuestionNo !== originQuestionNo
                  ? "The editor callback belongs to a question that is no longer open."
                  : "The editor callback returned a record for a different question.",
            },
          );
          return current;
        }
        if (
          current &&
          JSON.stringify(comparableQuestion(current)) !==
            JSON.stringify(comparableQuestion(next))
        ) {
          console.info("[GetGo Tools][Question draft][editor change]", {
            originQuestionNo,
            currentQuestionNo,
            nextQuestionNo,
            differences: questionDiff(current, next),
          });
        }
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    const questionNo = questionDraftRecord
      ? String(questionDraftRecord.question_no)
      : null;
    const previous = previousSaveButtonState.current;
    if (
      previous?.enabled === saveButtonEnabled &&
      previous.questionNo === questionNo
    )
      return;
    const diff =
      storedQuestion && questionDraftRecord
        ? questionDiff(storedQuestion, questionDraftRecord)
        : null;
    const reasons =
      !storedQuestion || !questionDraftRecord
        ? ["No question draft and stored question are both available."]
        : [
            !draftMatchesSelection
              ? "The selected question and draft identities differ during navigation; dirty state is suppressed."
              : saveButtonDirty
                ? "The editable draft differs from the stored question."
                : "The editable draft matches the stored question.",
            saving ? "A question save/reset operation is in progress." : null,
            savingVerification ? "A verification update is in progress." : null,
            diff?.draftSourceChanged
              ? "draftSourceTs differs, but it is derived and intentionally ignored by the dirty check."
              : null,
          ].filter((reason): reason is string => Boolean(reason));
    console.info("[GetGo Tools][Question save button][state changed]", {
      questionNo,
      previousEnabled: previous?.enabled ?? null,
      enabled: saveButtonEnabled,
      dirty: saveButtonDirty,
      saving,
      savingVerification,
      reasons,
      differences: diff,
    });
    previousSaveButtonState.current = {
      enabled: saveButtonEnabled,
      questionNo,
    };
  }, [
    questionDraftRecord,
    saveButtonDirty,
    saveButtonEnabled,
    saving,
    savingVerification,
    storedQuestion,
  ]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await managerApi.getAiMigrationJobs();
        if (active) setMigrationJobs(next.jobs);
      } catch (cause) {
        console.error("[GetGo Tools][Quiz migration status]", cause);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const saved = lastSavedQuestion.current;
    if (
      !saved ||
      !questionDraftRecord ||
      String(saved.question_no) !== String(questionDraftRecord.question_no)
    )
      return;
    const diff = questionDiff(saved, questionDraftRecord);
    if (!diff.changedFields.length && !diff.changedGeneratorFields.length)
      return;
    console.info("[GetGo Tools][Question save][post-save dirty state]", {
      questionNo: saved.question_no,
      ...diff,
    });
  }, [questionDraftRecord]);

  const contests = useMemo(() => {
    return snapshot.contests.map((contest) => ({
      ...contest,
      quizzes: snapshot.quizzes.filter((quiz) => quiz.contest === contest.id),
    }));
  }, [snapshot]);
  const selectedContest =
    page.kind === "contest"
      ? contests.find((item) => item.id === page.contest)
      : null;
  const normalizedQuery = query.trim().toLowerCase();
  const {
    topicGradeOptions,
    topicGrades,
    topicMatches,
    topicSubjectOptions,
    topicSubjects,
    setTopicGrades,
    setTopicSubjects,
  } = useTopicListFilters(snapshot.contentV2.topics, locale);
  const visibleContests = contests.filter(
    (contest) =>
      (!normalizedQuery ||
        `${contest.id} ${contest.title} ${contest.description}`
          .toLowerCase()
          .includes(normalizedQuery)) &&
      (routeMode !== "topics" ||
        topicMatches(contest.id)),
  );
  const visibleQuizzes = (selectedContest?.quizzes ?? []).filter(
    (quiz) =>
      !normalizedQuery ||
      `${quiz.id} ${quiz.legacyId} ${quiz.grade ?? ""} ${quiz.round ?? ""} ${quiz.year ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery),
  );
  const migrationForQuiz = (quiz: QuizSummary): QuizAiMigrationJob | null =>
    migrationJobs.find(
      (job) => job.contestId === quiz.contest && job.quizId === quiz.id,
    ) ??
    quiz.aiMigrationJob ??
    null;
  const legacyQuizCount =
    selectedContest?.quizzes.filter(
      (quiz) => quiz.questionStorageVersion === "legacy",
    ).length ?? 0;
  const allLegacyQuizCount = snapshot.quizzes.filter(
    (quiz) => quiz.questionStorageVersion === "legacy",
  ).length;

  useEffect(() => {
    if (page.kind === "contests") {
      onRouteChange(rootRoute);
      if (pendingQuestionNo) setPendingQuestionNo(null);
    }
    if (page.kind === "contest") {
      onRouteChange(
        `${contestRoute(page.contest)}${routeMode === "topics" && contestTab !== "quizzes" ? `?tab=${contestTab}` : ""}`,
      );
      if (pendingQuestionNo) setPendingQuestionNo(null);
    }
    if (page.kind === "quiz")
      onRouteChange(
        `${quizRoute(page.quiz.contest, page.quiz.id)}${pendingQuestionNo ? `/questions/${encodeURIComponent(pendingQuestionNo)}?tab=${page.quiz.type === "contest" ? questionEditorTab : alphabetEditorTab}` : `?tab=${quizTab}`}`,
      );
  }, [
    alphabetEditorTab,
    onRouteChange,
    page,
    pendingQuestionNo,
    questionEditorTab,
    quizTab,
    contestTab,
  ]);

  useEffect(() => {
    if (page.kind !== "quiz") return;
    let active = true;
    setSourceLoading(true);
    setSourceError(null);
    Promise.all([
      managerApi.loadQuizQuestions(page.quiz.manifestPath),
      page.quiz.type !== "contest"
        ? managerApi.loadAlphabetDictionary(page.quiz.manifestPath)
        : Promise.resolve<AlphabetDictionary>({ schemaVersion: 1, words: [] }),
    ])
      .then(([records, dictionary]) => {
        if (!active) return;
        setQuestionRecords(records);
        setAlphabetDictionary(dictionary);
        setQuestionOrder(null);
        if (pendingQuestionNo) {
          const index = records.findIndex(
            (record) => String(record.question_no) === pendingQuestionNo,
          );
          if (index >= 0) {
            setSelectedQuestion(index);
            setQuestionDraftRecord(structuredClone(records[index]));
          } else setPendingQuestionNo(null);
        }
      })
      .catch((cause) => {
        if (active)
          setSourceError(
            cause instanceof Error ? cause.message : String(cause),
          );
      })
      .finally(() => {
        if (active) setSourceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page]);

  useEffect(() => {
    if (page.kind !== "contest" || contestTab !== "dictionaries") return;
    const topic = snapshot.contentV2.topics.find(
      (item) => item.id === page.contest,
    );
    if (topic?.type !== "kid-learning") return;
    let active = true;
    setTopicResourceError(null);
    void window.getgo
      .loadContentV2TopicDictionary(topic.id)
      .then((dictionary) => {
        if (active) setTopicDictionary(dictionary);
      })
      .catch((cause) => {
        if (active)
          setTopicResourceError(
            cause instanceof Error ? cause.message : String(cause),
          );
      });
    return () => {
      active = false;
    };
  }, [contestTab, page, snapshot.contentV2.topics]);

  const backToQuestions = useCallback(() => {
    setSelectedQuestion(null);
    setPendingQuestionNo(null);
    setQuestionDraftRecord(null);
  }, []);

  const openQuiz = useCallback((quiz: QuizSummary) => {
    setSelectedQuestion(null);
    setPendingQuestionNo(null);
    setQuestionDraftRecord(null);
    setPreviewQuestion(null);
    setQuestionOrder(null);
    setQuestionRecords([]);
    setSourceError(null);
    setQuizTab(quiz.type === "contest" ? "questions" : "alphabets");
    setPage({ kind: "quiz", quiz });
  }, []);

  const goBack = useCallback(() => {
    setQuery("");
    if (page.kind === "quiz") {
      setContestTab("quizzes");
      setPage({ kind: "contest", contest: page.quiz.contest });
    } else setPage({ kind: "contests" });
  }, [page]);

  useEffect(() => {
    const action =
      page.kind === "contests"
        ? null
        : page.kind === "quiz" && selectedQuestion !== null
          ? backToQuestions
          : goBack;
    onBackActionChange(action);
    return () => onBackActionChange(null);
  }, [
    backToQuestions,
    goBack,
    onBackActionChange,
    page.kind,
    selectedQuestion,
  ]);

  const { runButtonAction, migrateLegacyQuizzes, migrateAllLegacyQuizzes } =
    useQuizMigrationActions({
      allLegacyQuizCount,
      buttonAction,
      contests,
      legacyQuizCount,
      managerApi,
      onSnapshotChange,
      selectedContest,
      setButtonAction,
      setMigrationResults,
      snapshot,
      toast,
    });

  if (page.kind === "quiz")
    return renderQuizPage({
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
      setSourceError,
      snapshot,
      sourceError,
      sourceLoading,
      speechSettings,
      toast,
      updateQuestionDraft,
    });

  return renderManagerPage({
    allLegacyQuizCount,
    buttonAction,
    contestDialog,
    contestTab,
    contests,
    legacyQuizCount,
    loadTreeTopicQuizzes,
    locale,
    managerApi,
    migrateAllLegacyQuizzes,
    migrateLegacyQuizzes,
    migrationForQuiz,
    migrationResults,
    openQuiz,
    onOpenJobs,
    onRouteChange,
    onSnapshotChange,
    page,
    query,
    topicGradeOptions,
    topicGrades,
    topicSubjectOptions,
    topicSubjects,
    quizDialog,
    rootRoute,
    routeMode,
    runButtonAction,
    selectedContest,
    setContestDialog,
    setContestTab,
    setMigrationResults,
    setPage,
    setQuery,
    setTopicGrades,
    setTopicSubjects,
    setQuizDialog,
    setQuizTab,
    setTopicDictionary,
    setTopicInfoDirty,
    setTopicsView,
    snapshot,
    toast,
    topicDictionary,
    topicInfoDirty,
    topicResourceError,
    topicsView,
    treeTopicQuizzes,
    visibleContests,
    visibleQuizzes,
  });
}
