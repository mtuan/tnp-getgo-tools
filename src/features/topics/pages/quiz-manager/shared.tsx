import { useEffect } from "react";
import { Save } from "lucide-react";
import type {
  AppSettings,
  QuizQuestionRecord,
  QuizSummary,
  RepositoryViewData,
  SpeechLanguage,
  SpeechLanguageSettings,
  DesktopApi,
} from "../../../../shared/domain/models";
import { Button } from "../../../../shared/ui/Button";
import { useSaveShortcut } from "../../../../shared/ui/useSaveShortcut";
import type { QuestionEditorTab } from "../../../quiz-editor/components/QuestionEditorTabs";
import type { AlphabetEditorTab } from "../../../quiz-editor/components/AlphabetLetterEditor";

export interface QuizManagerProps {
  locale: AppSettings["locale"];
  speechSettings: AppSettings["speech"];
  snapshot: RepositoryViewData;
  initialRoute?: string;
  onSnapshotChange(snapshot: RepositoryViewData): void;
  onRouteChange(route: string): void;
  onOpenJobs(): void;
  onBackActionChange(action: (() => void) | null): void;
  onSpeechSettingsChange(
    language: SpeechLanguage,
    settings: SpeechLanguageSettings,
  ): Promise<void>;
  api?: QuizManagerApi;
  routeMode?: "legacy" | "topics";
}

export function QuestionEditorKeyboardShortcuts({
  onSave,
  onNewQuestion,
  saveDisabled,
  newQuestionDisabled,
}: {
  onSave(): void;
  onNewQuestion(): void;
  saveDisabled: boolean;
  newQuestionDisabled: boolean;
}) {
  useSaveShortcut({ enabled: !saveDisabled, onSave });
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey)
        return;
      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        if (!newQuestionDisabled) onNewQuestion();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [newQuestionDisabled, onNewQuestion]);
  return null;
}

export function QuestionOrderActions({
  dirty,
  busy,
  onCancel,
  onSave,
}: {
  dirty: boolean;
  busy: boolean;
  onCancel(): void;
  onSave(): void;
}) {
  useSaveShortcut({ enabled: dirty && !busy, onSave });
  return (
    <>
      <Button
        variant="outline"
        color="neutral"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </Button>
      <Button
        icon={<Save size={15} />}
        variant="solid"
        loading={busy}
        disabled={!dirty || busy}
        onClick={onSave}
      >
        Save order
      </Button>
    </>
  );
}

export type QuizManagerApi = Pick<
  DesktopApi,
  | "getAiMigrationJobs"
  | "loadQuizQuestions"
  | "loadAlphabetDictionary"
  | "saveAlphabetDictionary"
  | "migrateLegacyQuizzes"
  | "saveQuizQuestion"
  | "markAllQuizQuestionsReviewed"
  | "resetQuizQuestion"
  | "showQuizQuestionInFolder"
  | "showInFolder"
  | "deleteQuiz"
  | "publishQuiz"
  | "reorderQuizQuestions"
  | "createQuizQuestion"
  | "startAiMigrationJob"
  | "updateQuiz"
  | "deleteQuizQuestion"
  | "deleteContest"
  | "updateContest"
  | "createContest"
  | "createQuiz"
  | "publishContentV2Topic"
  | "loadContentV2Topic"
  | "setContentV2MarketplaceState"
  | "loadContentV2Quiz"
  | "publishMarketplaceTopic"
> & {
  loadTopicQuizzes?(topicId: string): Promise<QuizSummary[]>;
  saveContentV2Topic(topic: import("../../../../features/topics/domain/content-v2").ContentV2Topic): Promise<RepositoryViewData>;
  saveContentV2Quiz(topicId: string, quiz: import("../../../../features/topics/domain/content-v2").ContentV2Quiz): Promise<RepositoryViewData>;
};

export type ManagerPage =
  | { kind: "contests" }
  | { kind: "contest"; contest: string }
  | { kind: "quiz"; quiz: QuizSummary };
export type QuizDetailTab =
  "questions" | "alphabets" | "dictionary" | "info";
export type ContestDetailTab =
  "info" | "quizzes" | "dictionaries" | "assets";

export interface QuestionListItem {
  number: string;
  category: string;
  prompt: string;
  dynamic: boolean;
  hasImages: boolean;
  reviewed: boolean;
  status: string;
  record: QuizQuestionRecord;
}

export function questionPrompt(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string").join(" ");
  return "Question content";
}

export function comparableQuestion(record: QuizQuestionRecord | null): unknown {
  if (!record) return record;
  if (!record.advancedDynamic) return record;
  const { draftSourceTs: _derivedDraftSource, ...advancedDynamic } =
    record.advancedDynamic;
  return { ...record, advancedDynamic };
}

export function questionDiff(before: QuizQuestionRecord, after: QuizQuestionRecord) {
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

export function quizReviewStatus(quiz: QuizSummary): {
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

export function contentV2QuizReviewStatus(
  snapshot: RepositoryViewData,
  quiz: QuizSummary,
) {
  const questions = snapshot.contentV2.questions.filter(
    (question) =>
      question.topicId === quiz.contest && question.quizId === quiz.id,
  );
  const reviewed = questions.filter(
    (question) => question.status === "reviewed",
  ).length;
  const total = questions.length;
  return {
    kind: total > 0 && reviewed === total
      ? "full" as const
      : reviewed > 0
        ? "partial" as const
        : "none" as const,
    label: `${reviewed}/${total}`,
    reviewed,
    total,
  };
}


export function restoredPage(
  snapshot: RepositoryViewData,
  route?: string,
  routeMode: "legacy" | "topics" = "legacy",
): {
  page: ManagerPage;
  questionNo: string | null;
  questionTab: QuestionEditorTab;
  alphabetTab: AlphabetEditorTab;
  quizTab: QuizDetailTab;
} {
  const rootRoute = routeMode === "topics" ? "/topics" : "/quizzes/contests";
  if (!route || (route !== rootRoute && !route.startsWith(`${rootRoute}/`)))
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
    url = new URL(rootRoute, "app://getgo");
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
  const contestIndex = routeMode === "topics" ? 1 : 2;
  const quizMarkerIndex = contestIndex + 1;
  const quizIndex = contestIndex + 2;
  const questionMarkerIndex = contestIndex + 3;
  const questionIndex = contestIndex + 4;
  const isQuestionRoute =
    parts[questionMarkerIndex] === "questions" && Boolean(parts[questionIndex]);
  const questionTab =
    url.searchParams.get("tab") === "dynamic" ? "dynamic" : "static";
  const alphabetTab: AlphabetEditorTab =
    url.searchParams.get("tab") === "related-words"
      ? "related-words"
      : url.searchParams.get("tab") === "resources"
        ? "resources"
        : "info";
  const requestedQuizTab = isQuestionRoute ? null : url.searchParams.get("tab");
  let quizTab: QuizDetailTab =
    requestedQuizTab === "info"
      ? requestedQuizTab
      : "questions";
  const contest = snapshot.contests.find(
    (item) => item.id === parts[contestIndex],
  );
  if (!contest)
    return {
      page: { kind: "contests" },
      questionNo: null,
      questionTab,
      alphabetTab,
      quizTab,
    };
  if (parts[quizMarkerIndex] !== "quizzes" || !parts[quizIndex])
    return {
      page: { kind: "contest", contest: contest.id },
      questionNo: null,
      questionTab,
      alphabetTab,
      quizTab,
    };
  const quiz = snapshot.quizzes.find(
    (item) => item.contest === contest.id && item.id === parts[quizIndex],
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
    quizTab = quiz.type === "contest" ? "questions" : "alphabets";
  const requestedQuestionNo = isQuestionRoute ? parts[questionIndex] : null;
  const v2Question = requestedQuestionNo
    ? snapshot.contentV2.questions.find(
        (item) =>
          item.topicId === contest.id &&
          item.quizId === quiz.id &&
          item.id === requestedQuestionNo,
      )
    : null;
  return {
    page: { kind: "quiz", quiz },
    questionNo: v2Question ? String(v2Question.order + 1) : requestedQuestionNo,
    questionTab,
    alphabetTab,
    quizTab,
  };
}
