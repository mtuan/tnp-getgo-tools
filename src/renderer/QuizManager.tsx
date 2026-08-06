import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  FolderOpen,
  ListOrdered,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Zap,
} from "lucide-react";
import type {
  AiMigrationJob,
  AppSettings,
  AlphabetDictionary,
  ContestQuizQuestionRecord,
  ContestSummary,
  QuizAiMigrationJob,
  QuizCrudInput,
  QuizMigrationResult,
  QuizQuestionRecord,
  QuizSummary,
  RepositorySnapshot,
} from "../core/models";
import { questionHasDynamicParams } from "../core/question-dynamics";
import { alphabetData } from "../core/alphabet-question";
import { alphabetWordContainsLetter } from "../core/alphabet-letter";
import { questionContainsImages } from "../core/question-images";
import { isCurrentQuestionDraftChange } from "../core/question-draft";
import {
  questionIsVerified,
  questionStatus,
  withQuestionStatus,
} from "../core/question-status";
import { QuizCrudDialog } from "./CrudDialogs";
import { ContestSettingsDialog } from "./ContestSettingsDialog";
import {
  QuestionEditorTabs,
  type QuestionEditorTab,
} from "./QuestionEditorTabs";
import { MigrationResultsDrawer } from "./MigrationResultsDrawer";
import { QuestionListPreviewDrawer } from "./QuestionListPreviewDrawer";
import { Button } from "./ui/Button";
import { PageHeader } from "./ui/PageHeader";
import { QuestionNavigator } from "./ui/QuestionNavigator";
import { Tabs } from "./ui/Tabs";
import { DataTable, type DataColumn } from "./ui/DataTable";
import { TableActionButton } from "./ui/TableActionButton";
import { ActionMenu } from "./ui/ActionMenu";
import { SegmentedControl } from "./ui/SegmentedControl";
import { useToast } from "./ui/Toast";
import {
  AlphabetLetterEditor,
  type AlphabetEditorTab,
} from "./AlphabetLetterEditor";

interface QuizManagerProps {
  locale: AppSettings["locale"];
  snapshot: RepositorySnapshot;
  initialRoute?: string;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onRouteChange(route: string): void;
  onBackActionChange(action: (() => void) | null): void;
}

type ManagerPage =
  | { kind: "contests" }
  | { kind: "contest"; contest: string }
  | { kind: "quiz"; quiz: QuizSummary };
type QuizDetailTab = "questions" | "alphabets" | "info";

interface QuestionListItem {
  number: string;
  category: string;
  prompt: string;
  dynamic: boolean;
  hasImages: boolean;
  reviewed: boolean;
  status: string;
  record: QuizQuestionRecord;
}

function questionPrompt(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string").join(" ");
  return "Question content";
}

function comparableQuestion(record: QuizQuestionRecord | null): unknown {
  if (!record) return record;
  if (!record.advancedDynamic) return record;
  const { draftSourceTs: _derivedDraftSource, ...advancedDynamic } =
    record.advancedDynamic;
  return { ...record, advancedDynamic };
}

function questionDiff(before: QuizQuestionRecord, after: QuizQuestionRecord) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changedFields = keys.filter(
    (key) =>
      key !== "advancedDynamic" &&
      JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
  const advancedKeys = [
    ...new Set([
      ...Object.keys(before.advancedDynamic ?? {}),
      ...Object.keys(after.advancedDynamic ?? {}),
    ]),
  ];
  const changedGeneratorFields = advancedKeys
    .filter(
      (key) =>
        key !== "draftSourceTs" &&
        JSON.stringify(before.advancedDynamic?.[key]) !==
          JSON.stringify(after.advancedDynamic?.[key]),
    )
    .map((key) => {
      const beforeValue = String(before.advancedDynamic?.[key] ?? "");
      const afterValue = String(after.advancedDynamic?.[key] ?? "");
      return {
        key,
        beforeLength: beforeValue.length,
        afterLength: afterValue.length,
        beforePreview: beforeValue.slice(0, 180),
        afterPreview: afterValue.slice(0, 180),
      };
    });
  const draftSourceChanged =
    before.advancedDynamic?.draftSourceTs !==
    after.advancedDynamic?.draftSourceTs;
  return { changedFields, changedGeneratorFields, draftSourceChanged };
}

function quizReviewStatus(quiz: QuizSummary): {
  kind: "full" | "partial" | "none";
  label: string;
  reviewed: number;
  total: number;
} {
  const total = Math.max(0, quiz.questionCount ?? 0);
  const reviewed = Math.max(0, Math.min(quiz.reviewedQuestionCount, total));
  if (total > 0 && reviewed === total)
    return { kind: "full", label: "Fully reviewed", reviewed, total };
  if (reviewed > 0)
    return { kind: "partial", label: "Partially reviewed", reviewed, total };
  return { kind: "none", label: "Not reviewed", reviewed, total };
}

function restoredPage(
  snapshot: RepositorySnapshot,
  route?: string,
): {
  page: ManagerPage;
  questionNo: string | null;
  questionTab: QuestionEditorTab;
  alphabetTab: AlphabetEditorTab;
  quizTab: QuizDetailTab;
} {
  if (!route?.startsWith("/quizzes/contests/"))
    return {
      page: { kind: "contests" },
      questionNo: null,
      questionTab: "static",
      alphabetTab: "info",
      quizTab: "questions",
    };
  let url: URL;
  try {
    url = new URL(route, "app://getgo");
  } catch {
    url = new URL("/quizzes/contests", "app://getgo");
  }
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
  const isQuestionRoute = parts[5] === "questions" && Boolean(parts[6]);
  const questionTab =
    url.searchParams.get("tab") === "dynamic" ? "dynamic" : "static";
  const alphabetTab: AlphabetEditorTab =
    url.searchParams.get("tab") === "related-words" ? "related-words" : "info";
  let quizTab: QuizDetailTab =
    !isQuestionRoute && url.searchParams.get("tab") === "info"
      ? "info"
      : "questions";
  const contest = snapshot.contests.find((item) => item.id === parts[2]);
  if (!contest)
    return {
      page: { kind: "contests" },
      questionNo: null,
      questionTab,
      alphabetTab,
      quizTab,
    };
  if (parts[3] !== "quizzes" || !parts[4])
    return {
      page: { kind: "contest", contest: contest.id },
      questionNo: null,
      questionTab,
      alphabetTab,
      quizTab,
    };
  const quiz = snapshot.quizzes.find(
    (item) => item.contest === contest.id && item.id === parts[4],
  );
  if (!quiz)
    return {
      page: { kind: "contest", contest: contest.id },
      questionNo: null,
      questionTab,
      alphabetTab,
      quizTab,
    };
  if (quizTab !== "info")
    quizTab = quiz.type === "question-list" ? "questions" : "alphabets";
  return {
    page: { kind: "quiz", quiz },
    questionNo: isQuestionRoute ? parts[6] : null,
    questionTab,
    alphabetTab,
    quizTab,
  };
}

export function QuizManager({
  locale,
  snapshot,
  initialRoute,
  onSnapshotChange,
  onRouteChange,
  onBackActionChange,
}: QuizManagerProps) {
  const toast = useToast();
  const [restored] = useState(() => restoredPage(snapshot, initialRoute));
  const [page, setPage] = useState<ManagerPage>(restored.page);
  const [query, setQuery] = useState("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingVerification, setSavingVerification] = useState(false);
  const [questionOperation, setQuestionOperation] = useState<
    "save" | "reset" | null
  >(null);
  const [buttonAction, setButtonAction] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [contestDialog, setContestDialog] = useState<
    ContestSummary | "create" | null
  >(null);
  const [quizDialog, setQuizDialog] = useState<QuizSummary | "create" | null>(
    null,
  );
  const [contestTab, setContestTab] = useState<"info" | "quizzes">("quizzes");
  const [quizTab, setQuizTab] = useState<QuizDetailTab>(restored.quizTab);
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null);
  const [questionRecords, setQuestionRecords] = useState<QuizQuestionRecord[]>(
    [],
  );
  const [alphabetDictionary, setAlphabetDictionary] =
    useState<AlphabetDictionary>({ schemaVersion: 1, words: [] });
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

  useEffect(() => {
    const selectedRecord =
      selectedQuestion === null
        ? null
        : (questionRecords[selectedQuestion] ?? null);
    console.info("[GetGo Tools][Question navigation][state]", {
      selectedIndex: selectedQuestion,
      selectedQuestionNo: selectedRecord
        ? String(selectedRecord.question_no)
        : null,
      draftQuestionNo: questionDraftRecord
        ? String(questionDraftRecord.question_no)
        : null,
      identitiesMatch: Boolean(
        selectedRecord &&
        questionDraftRecord &&
        String(selectedRecord.question_no) ===
          String(questionDraftRecord.question_no),
      ),
      draftTextPreview: questionDraftRecord
        ? questionPrompt(
            questionDraftRecord.text_en ?? questionDraftRecord.text_vn,
          ).slice(0, 120)
        : null,
    });
  }, [questionDraftRecord?.question_no, questionRecords, selectedQuestion]);

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
        const next = await window.getgo.getAiMigrationJobs();
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
  const visibleContests = contests.filter(
    (contest) =>
      !normalizedQuery ||
      `${contest.id} ${contest.title} ${contest.description}`
        .toLowerCase()
        .includes(normalizedQuery),
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
      onRouteChange("/quizzes/contests");
      if (pendingQuestionNo) setPendingQuestionNo(null);
    }
    if (page.kind === "contest") {
      onRouteChange(`/quizzes/contests/${encodeURIComponent(page.contest)}`);
      if (pendingQuestionNo) setPendingQuestionNo(null);
    }
    if (page.kind === "quiz")
      onRouteChange(
        `/quizzes/contests/${encodeURIComponent(page.quiz.contest)}/quizzes/${encodeURIComponent(page.quiz.id)}${pendingQuestionNo ? `/questions/${encodeURIComponent(pendingQuestionNo)}?tab=${page.quiz.type === "question-list" ? questionEditorTab : alphabetEditorTab}` : `?tab=${quizTab}`}`,
      );
  }, [
    alphabetEditorTab,
    onRouteChange,
    page,
    pendingQuestionNo,
    questionEditorTab,
    quizTab,
  ]);

  useEffect(() => {
    if (page.kind !== "quiz") return;
    let active = true;
    setSourceLoading(true);
    setSourceError(null);
    Promise.all([
      window.getgo.loadQuizQuestions(page.quiz.manifestPath),
      page.quiz.type === "alphabet-english" ||
      page.quiz.type === "alphabet-vietnamese"
        ? window.getgo.loadAlphabetDictionary(page.quiz.manifestPath)
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

  const backToQuestions = useCallback(() => {
    setSelectedQuestion(null);
    setPendingQuestionNo(null);
  }, []);

  const goBack = useCallback(() => {
    setQuery("");
    if (page.kind === "quiz")
      setPage({ kind: "contest", contest: page.quiz.contest });
    else setPage({ kind: "contests" });
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

  async function runButtonAction(key: string, action: () => Promise<void>) {
    if (buttonAction) return;
    setButtonAction(key);
    try {
      await action();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      toast.show({
        title: "Operation failed",
        description: message,
        variant: "error",
      });
    } finally {
      setButtonAction(null);
    }
  }

  async function migrateLegacyQuizzes() {
    if (
      !selectedContest ||
      !legacyQuizCount ||
      !window.confirm(
        `Migrate ${legacyQuizCount} legacy quiz${legacyQuizCount === 1 ? "" : "zes"}? Questions will be extracted from raw.ts, falling back to raw.json. Existing source files will not be changed.`,
      )
    )
      return;
    await runButtonAction("migrate-legacy", async () => {
      const result = await window.getgo.migrateLegacyQuizzes(
        selectedContest.id,
      );
      onSnapshotChange(result.snapshot);
      if (result.failures.length) {
        const details = result.failures
          .map((failure) => `${failure.quizId}: ${failure.message}`)
          .join("\n");
        console.error("[GetGo Tools][Quiz migration]", details);
        setMigrationResults({ result, attempted: legacyQuizCount });
        toast.show({
          title: `Migrated ${result.migratedQuizIds.length} of ${legacyQuizCount} quizzes`,
          description: `${result.failures.length} quiz${result.failures.length === 1 ? "" : "zes"} failed. See migration results for details.`,
          variant: "error",
        });
        return;
      }
      toast.show({
        title: `${result.migratedQuizIds.length} quiz${result.migratedQuizIds.length === 1 ? "" : "zes"} migrated`,
        description:
          "Questions were extracted into the new questions folder structure.",
      });
    });
  }

  async function migrateAllLegacyQuizzes() {
    if (
      !allLegacyQuizCount ||
      !window.confirm(
        `Migrate all ${allLegacyQuizCount} legacy quizzes across every contest? Questions will be extracted from raw.ts, falling back to raw.json. Existing source files will not be changed.`,
      )
    )
      return;
    await runButtonAction("migrate-all-legacy", async () => {
      const migratedQuizIds: string[] = [];
      const failures: QuizMigrationResult["failures"] = [];
      let latestSnapshot = snapshot;
      for (const contest of contests) {
        const contestLegacyCount = contest.quizzes.filter(
          (quiz) => quiz.questionStorageVersion === "legacy",
        ).length;
        if (!contestLegacyCount) continue;
        try {
          const result = await window.getgo.migrateLegacyQuizzes(contest.id);
          latestSnapshot = result.snapshot;
          migratedQuizIds.push(
            ...result.migratedQuizIds.map(
              (quizId) => `${contest.id}/${quizId}`,
            ),
          );
          failures.push(
            ...result.failures.map((failure) => ({
              ...failure,
              quizId: `${contest.id}/${failure.quizId}`,
            })),
          );
        } catch (cause) {
          const message =
            cause instanceof Error ? cause.message : String(cause);
          failures.push(
            ...contest.quizzes
              .filter((quiz) => quiz.questionStorageVersion === "legacy")
              .map((quiz) => ({ quizId: `${contest.id}/${quiz.id}`, message })),
          );
        }
      }
      onSnapshotChange(latestSnapshot);
      const result: QuizMigrationResult = {
        snapshot: latestSnapshot,
        migratedQuizIds,
        failures,
      };
      if (failures.length) {
        console.error(
          "[GetGo Tools][All-contest quiz migration]",
          failures
            .map((failure) => `${failure.quizId}: ${failure.message}`)
            .join("\n"),
        );
        setMigrationResults({ result, attempted: allLegacyQuizCount });
        toast.show({
          title: `Migrated ${migratedQuizIds.length} of ${allLegacyQuizCount} quizzes`,
          description: `${failures.length} quiz${failures.length === 1 ? "" : "zes"} failed. See migration results for details.`,
          variant: "error",
        });
        return;
      }
      toast.show({
        title: `All ${migratedQuizIds.length} legacy quizzes migrated`,
        description: "Questions were extracted for every contest.",
      });
    });
  }

  if (page.kind === "quiz") {
    const { quiz } = page;
    const quizContest = snapshot.contests.find(
      (contest) => contest.id === quiz.contest,
    );
    const questions: QuestionListItem[] = questionRecords.map((record) => ({
      number: String(record.question_no),
      category: typeof record.category === "string" ? record.category : "—",
      prompt: questionPrompt(record.text_en ?? record.text_vn),
      dynamic: questionHasDynamicParams(record.advancedDynamic),
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
        render: (item) => <strong>#{item.number}</strong>,
      },
      {
        key: "letter",
        title: "Letter",
        width: 130,
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
          const language =
            quiz.type === "alphabet-vietnamese" ? "Vietnamese" : "English";
          return alphabetDictionary.words.filter((word) =>
            alphabetWordContainsLetter(word.text, letter, language),
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
    const activeQuestion =
      selectedQuestion === null ? null : questions[selectedQuestion];
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
          const savedQuestion = await window.getgo.saveQuizQuestion(
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
          const reset = await window.getgo.resetQuizQuestion(
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
          const savedQuestion = await window.getgo.saveQuizQuestion(
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
        const savedQuestion = await window.getgo.saveQuizQuestion(
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
      return (
        <section className="manager editor-page question-detail-page">
          <PageHeader
            eyebrow={isAlphabetQuestion ? "Letter editor" : "Question editor"}
            breadcrumbs={[
              {
                label: "Contests",
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
                ? `${quiz.type === "alphabet-vietnamese" ? "Vietnamese" : "English"} alphabet · questions/`
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
                    window.getgo.showQuizQuestionInFolder(
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
                <SegmentedControl
                  className="question-review-control"
                  ariaLabel="Question status"
                  value={
                    questionDraftRecord
                      ? questionStatus(questionDraftRecord)
                      : "pending"
                  }
                  disabled={saving || savingVerification}
                  options={[
                    { value: "pending", label: "Pending" },
                    { value: "verified", label: "Reviewed" },
                    { value: "rejected", label: "Rejected" },
                  ]}
                  onValueChange={(status) =>
                    void setQuestionReviewStatus(status)
                  }
                />
                {!isAlphabetQuestion && (
                  <Button
                    icon={<RotateCcw size={15} />}
                    loading={questionOperation === "reset"}
                    variant="solid"
                    color="danger"
                    disabled={
                      saving ||
                      savingVerification ||
                      !questionDraftRecord?.advancedDynamic
                    }
                    onClick={() => void resetQuestion()}
                  >
                    Reset
                  </Button>
                )}
                <Button
                  icon={<Save size={15} />}
                  loading={questionOperation === "save"}
                  variant="solid"
                  disabled={!questionHasChanges || saving || savingVerification}
                  onClick={() => void saveQuestion()}
                >
                  Save
                </Button>
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
                manifestPath={quiz.manifestPath}
                dictionaryWords={alphabetDictionary.words}
                quizType={
                  quiz.type === "alphabet-vietnamese"
                    ? "alphabet-vietnamese"
                    : "alphabet-english"
                }
                record={questionDraftRecord}
                tab={alphabetEditorTab}
                onTabChange={setAlphabetEditorTab}
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
    return (
      <section className="manager editor-page">
        <PageHeader
          eyebrow="Quiz detail"
          breadcrumbs={[
            { label: "Contests", onClick: () => setPage({ kind: "contests" }) },
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
                  window.getgo.showInFolder(quiz.manifestPath),
                )
              }
            />
          }
          actions={
            quizTab === "info" ? (
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
                    const next = await window.getgo.deleteQuiz(
                      quiz.manifestPath,
                    );
                    const parentRoute = `/quizzes/contests/${encodeURIComponent(quiz.contest)}`;
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
            ) : questionOrder ? (
              <>
                <Button
                  variant="outline"
                  color="neutral"
                  disabled={Boolean(buttonAction)}
                  onClick={() => setQuestionOrder(null)}
                >
                  Cancel
                </Button>
                <Button
                  icon={<Save size={15} />}
                  variant="solid"
                  loading={buttonAction === "save-question-order"}
                  disabled={Boolean(buttonAction)}
                  onClick={() =>
                    void runButtonAction("save-question-order", async () => {
                      const result = await window.getgo.reorderQuizQuestions(
                        quiz.manifestPath,
                        questionOrder,
                      );
                      setQuestionRecords(result.questions);
                      setQuestionOrder(null);
                      onSnapshotChange(result.snapshot);
                      toast.show({
                        title: "Question order saved",
                        description:
                          "Only files inside questions/ were renumbered.",
                      });
                    })
                  }
                >
                  Save order
                </Button>
              </>
            ) : (
              <>
                <Button
                  icon={<Plus size={15} />}
                  variant="solid"
                  loading={buttonAction === "create-question"}
                  disabled={sourceLoading || Boolean(buttonAction)}
                  onClick={() =>
                    void runButtonAction("create-question", async () => {
                      const result = await window.getgo.createQuizQuestion(
                        quiz.manifestPath,
                      );
                      const nextRecords = [...questionRecords, result.question];
                      setQuestionRecords(nextRecords);
                      onSnapshotChange(result.snapshot);
                      const index = nextRecords.length - 1;
                      setSelectedQuestion(index);
                      setQuestionDraftRecord(structuredClone(result.question));
                      setPendingQuestionNo(String(result.question.question_no));
                      setQuestionEditorTab("static");
                      toast.show({
                        title: `Question ${result.question.question_no} created`,
                        description: "A new file was added to questions/.",
                      });
                    })
                  }
                >
                  {quiz.type === "question-list"
                    ? "Add question"
                    : "Add letter"}
                </Button>
                <ActionMenu
                  disabled={sourceLoading || Boolean(buttonAction)}
                  items={[
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
                    ...(quiz.type === "question-list"
                      ? [
                          {
                            id: "ai-migrate",
                            label: "AI migrate",
                            icon: Zap,
                            onSelect: () =>
                              void runButtonAction("ai-migrate", async () => {
                                const job =
                                  await window.getgo.startAiMigrationJob({
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
            quiz.type === "question-list"
              ? {
                  id: "questions" as const,
                  label: "Questions",
                  badge: questions.length || quiz.questionCount || 0,
                }
              : {
                  id: "alphabets" as const,
                  label: "Alphabets",
                  badge: questions.length || quiz.questionCount || 0,
                },
            { id: "info", label: "Info" },
          ]}
        />
        {quizTab === "info" && quizContest && (
          <QuizCrudDialog
            embedded
            quiz={quiz}
            contest={quizContest}
            onClose={() => undefined}
            onSaved={async (input) => {
              const next = await window.getgo.updateQuiz(quiz.manifestPath, {
                title: input.title,
                type: input.type,
                grade: input.grade,
                round: input.round,
                year: input.year,
                status: input.status,
                quizBuilderApiVersion: input.quizBuilderApiVersion,
              });
              onSnapshotChange(next);
              const updated = next.quizzes.find(
                (item) => item.key === quiz.key,
              );
              if (updated) setPage({ kind: "quiz", quiz: updated });
              toast.show({
                title: "Quiz updated",
                description: `${input.title} was saved.`,
              });
            }}
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
              ariaLabel="Alphabet letters"
              rows={questions}
              columns={alphabetColumns}
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
        {quiz.type === "question-list" && previewQuestion && (
          <QuestionListPreviewDrawer
            record={previewQuestion}
            manifestPath={quiz.manifestPath}
            onClose={() => setPreviewQuestion(null)}
            onDelete={async () => {
              const result = await window.getgo.deleteQuizQuestion(
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

  const isContest = page.kind === "contest";
  return (
    <section className="manager">
      <PageHeader
        eyebrow="Quiz manager"
        breadcrumbs={
          isContest
            ? [
                {
                  label: "Contests",
                  onClick: () => setPage({ kind: "contests" }),
                },
              ]
            : undefined
        }
        title={
          isContest
            ? (selectedContest?.title ?? page.contest.toUpperCase())
            : "Contests"
        }
        description={
          isContest
            ? `${selectedContest?.quizzes.length ?? 0} quizzes in this contest`
            : `${contests.length} contests across the local repository`
        }
        titleAction={
          isContest && selectedContest ? (
            <Button
              className="ui-page-header-folder"
              icon={<FolderOpen />}
              variant="icon"
              disabled={Boolean(buttonAction)}
              aria-label="Show contest in folder"
              title="Show contest in folder"
              onClick={() =>
                void runButtonAction("show-contest-folder", () =>
                  window.getgo.showInFolder(selectedContest.settingsPath),
                )
              }
            />
          ) : undefined
        }
        actions={
          <>
            {!isContest && allLegacyQuizCount > 0 && (
              <Button
                icon={<RefreshCw size={15} />}
                loading={buttonAction === "migrate-all-legacy"}
                variant="solid"
                color="warning"
                disabled={Boolean(buttonAction)}
                onClick={() => void migrateAllLegacyQuizzes()}
              >
                Migrate all {allLegacyQuizCount}
              </Button>
            )}
            {isContest && contestTab === "quizzes" && legacyQuizCount > 0 && (
              <Button
                icon={<RefreshCw size={15} />}
                loading={buttonAction === "migrate-legacy"}
                variant="solid"
                color="warning"
                disabled={Boolean(buttonAction)}
                onClick={() => void migrateLegacyQuizzes()}
              >
                Migrate {legacyQuizCount}
              </Button>
            )}
            {(!isContest || contestTab === "quizzes") && (
              <Button
                icon={<Plus size={15} />}
                variant="solid"
                disabled={Boolean(buttonAction)}
                onClick={() =>
                  isContest
                    ? setQuizDialog("create")
                    : setContestDialog("create")
                }
              >
                {isContest ? "Create quiz" : "Create contest"}
              </Button>
            )}
            {isContest && contestTab === "info" && selectedContest && (
              <Button
                icon={<Trash2 size={15} />}
                loading={buttonAction === "delete-contest"}
                variant="solid"
                color="danger"
                disabled={Boolean(buttonAction)}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete ${selectedContest.title}? This will move the contest folder to Trash.`,
                    )
                  )
                    return;
                  void runButtonAction("delete-contest", async () => {
                    const next = await window.getgo.deleteContest(
                      selectedContest.id,
                    );
                    onRouteChange("/quizzes/contests");
                    setPage({ kind: "contests" });
                    onSnapshotChange(next);
                    toast.show({
                      title: "Contest deleted",
                      description: `${selectedContest.title} was moved to Trash.`,
                    });
                  });
                }}
              >
                Delete contest
              </Button>
            )}
          </>
        }
      />
      {isContest && (
        <Tabs<"info" | "quizzes">
          variant="underline"
          className="contest-detail-tabs"
          ariaLabel="Contest detail"
          value={contestTab}
          onChange={setContestTab}
          items={[
            {
              id: "quizzes",
              label: "Quizzes",
              badge: selectedContest?.quizzes.length ?? 0,
            },
            { id: "info", label: "Info" },
          ]}
        />
      )}
      {isContest && contestTab === "info" && selectedContest && (
        <ContestSettingsDialog
          embedded
          contest={selectedContest}
          onClose={() => undefined}
          onSaved={async (settings) => {
            const next = await window.getgo.updateContest(
              selectedContest.id,
              settings,
            );
            onSnapshotChange(next);
            toast.show({
              title: "Contest updated",
              description: `${settings.book.title} was saved.`,
            });
          }}
        />
      )}
      {(!isContest || contestTab === "quizzes") && (
        <>
          <div className="manager-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isContest ? "Search quizzes…" : "Search contests…"}
            />
          </div>
          <div className="manager-table">
            <table>
              <thead>
                <tr>
                  {isContest ? (
                    <>
                      <th>Quiz</th>
                      <th>Version</th>
                      <th>Grade</th>
                      <th>Year / round</th>
                      <th>Questions</th>
                      <th>Reviewed</th>
                      <th>Status</th>
                      <th />
                    </>
                  ) : (
                    <>
                      <th>Contest</th>
                      <th>Quizzes</th>
                      <th>Ready</th>
                      <th>Builds</th>
                      <th />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {isContest
                  ? visibleQuizzes.map((quiz) => {
                      const review = quizReviewStatus(quiz);
                      const migration = migrationForQuiz(quiz);
                      const percent = migration
                        ? migration.total
                          ? Math.min(
                              100,
                              Math.round(
                                (migration.processed / migration.total) * 100,
                              ),
                            )
                          : 100
                        : 0;
                      const activeMigration =
                        migration &&
                        (migration.status === "queued" ||
                          migration.status === "running");
                      return (
                        <tr
                          key={quiz.key}
                          onClick={() => {
                            setPage({ kind: "quiz", quiz });
                            setQuizTab(
                              quiz.type === "question-list"
                                ? "questions"
                                : "alphabets",
                            );
                          }}
                        >
                          <td>
                            <strong>{quiz.title}</strong>
                            <span>{quiz.id}</span>
                          </td>
                          <td>
                            <span
                              className={`badge quiz-version quiz-version-${quiz.questionStorageVersion}`}
                            >
                              {quiz.questionStorageVersion === "questions-v1"
                                ? "Questions v1"
                                : "Legacy"}
                            </span>
                          </td>
                          <td>{quiz.grade ?? "—"}</td>
                          <td>
                            <strong>{quiz.year ?? "—"}</strong>
                            <span>{quiz.round ?? "No round"}</span>
                          </td>
                          <td>{quiz.questionCount ?? "—"}</td>
                          <td>
                            <span
                              className={`badge review-status review-status-${review.kind}`}
                              title={review.label}
                              aria-label={`${review.label}: ${review.reviewed} of ${review.total}`}
                            >
                              {review.reviewed}/{review.total}
                            </span>
                            {quiz.migrationErrorCount > 0 && (
                              <span className="badge badge-error">
                                {quiz.migrationErrorCount} errors
                              </span>
                            )}
                          </td>
                          <td>
                            {migration ? (
                              migration.status === "completed" ? (
                                <span className="badge job-status job-status-completed">
                                  Migrated ({migration.succeeded}/
                                  {migration.total})
                                </span>
                              ) : (
                                <div className="quiz-migration-status">
                                  <span
                                    className={`badge job-status job-status-${migration.status}`}
                                  >
                                    {migration.status}
                                  </span>
                                  <span>
                                    {activeMigration
                                      ? `${percent}% · ${migration.processed}/${migration.total}`
                                      : `${migration.succeeded} saved${migration.failed ? ` · ${migration.failed} failed` : ""}`}
                                  </span>
                                </div>
                              )
                            ) : (
                              <span className="badge job-status">
                                Not started
                              </span>
                            )}
                          </td>
                          <td>
                            <ChevronRight size={16} />
                          </td>
                        </tr>
                      );
                    })
                  : visibleContests.map((contest) => {
                      const ready = contest.quizzes.filter((quiz) =>
                        ["reviewed", "validated", "published"].includes(
                          quiz.contentStatus,
                        ),
                      ).length;
                      const builds = contest.quizzes.filter(
                        (quiz) => quiz.hasGeneratedArtifact,
                      ).length;
                      return (
                        <tr
                          key={contest.id}
                          onClick={() => {
                            setPage({ kind: "contest", contest: contest.id });
                            setContestTab("quizzes");
                            setQuery("");
                          }}
                        >
                          <td>
                            <strong>{contest.title}</strong>
                            <span>
                              {contest.description || contest.id.toUpperCase()}
                            </span>
                          </td>
                          <td>{contest.quizzes.length}</td>
                          <td>{ready}</td>
                          <td>{builds}</td>
                          <td>
                            <ChevronRight size={16} />
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
            {(isContest ? visibleQuizzes : visibleContests).length === 0 && (
              <div className="no-results">
                No matching {isContest ? "quizzes" : "contests"}.
              </div>
            )}
          </div>
        </>
      )}
      {contestDialog && (
        <ContestSettingsDialog
          contest={contestDialog === "create" ? undefined : contestDialog}
          onClose={() => setContestDialog(null)}
          onSaved={async (settings) => {
            const creating = contestDialog === "create";
            const next = creating
              ? await window.getgo.createContest(settings)
              : await window.getgo.updateContest(contestDialog.id, settings);
            onSnapshotChange(next);
            setContestDialog(null);
            toast.show({
              title: creating ? "Contest created" : "Contest updated",
              description: `${settings.book.title} was saved.`,
            });
          }}
          onDeleted={
            contestDialog !== "create"
              ? async () => {
                  const title = contestDialog.title;
                  const next = await window.getgo.deleteContest(
                    contestDialog.id,
                  );
                  onRouteChange("/quizzes/contests");
                  setContestDialog(null);
                  setPage({ kind: "contests" });
                  onSnapshotChange(next);
                  toast.show({
                    title: "Contest deleted",
                    description: `${title} was moved to Trash.`,
                  });
                }
              : undefined
          }
        />
      )}
      {quizDialog === "create" && isContest && selectedContest && (
        <QuizCrudDialog
          contest={selectedContest}
          onClose={() => setQuizDialog(null)}
          onSaved={async (input: QuizCrudInput) => {
            const next = await window.getgo.createQuiz(page.contest, {
              ...input,
              status: "imported",
            });
            onSnapshotChange(next);
            setQuizDialog(null);
            toast.show({
              title: "Quiz created",
              description: `${input.title} is ready to edit.`,
            });
          }}
        />
      )}
      {migrationResults && (
        <MigrationResultsDrawer
          result={migrationResults.result}
          attempted={migrationResults.attempted}
          onClose={() => setMigrationResults(null)}
        />
      )}
    </section>
  );
}
