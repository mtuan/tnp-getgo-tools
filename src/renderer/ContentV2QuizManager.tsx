import { useMemo } from "react";
import type { ContentV2Question, ContentV2Quiz, ContentV2Topic } from "../core/content-v2";
import type {
  AlphabetDictionary,
  AppSettings,
  ContestSettings,
  ContestSummary,
  QuizCrudInput,
  QuizQuestionRecord,
  QuizSummary,
  RepositorySnapshot,
  SpeechLanguage,
  SpeechLanguageSettings,
} from "../core/models";
import { QuizManager, type QuizManagerApi } from "./QuizManager";

interface Props {
  locale: AppSettings["locale"];
  speechSettings: AppSettings["speech"];
  snapshot: RepositorySnapshot;
  initialRoute: string;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onRouteChange(route: string): void;
  onBackActionChange(action: (() => void) | null): void;
  onSpeechSettingsChange(language: SpeechLanguage, settings: SpeechLanguageSettings): Promise<void>;
}

type TopicDefinition = {
  subject: number;
  defaultQuizType: QuizSummary["type"];
};
type QuizDefinition = {
  managerType(quiz: RepositorySnapshot["contentV2"]["quizzes"][number]): QuizSummary["type"];
};

/** Adding a new content type requires a registry entry and adapter, not another page. */
export const contentV2ManagerRegistry = {
  topics: {
    competition: { subject: 1, defaultQuizType: "question-list" },
    "alphabet-learning": { subject: 2, defaultQuizType: "alphabet-english" },
  } satisfies Record<ContentV2Topic["type"], TopicDefinition>,
  quizzes: {
    "competition-paper": { managerType: () => "question-list" },
    "alphabet-course": {
      managerType: (quiz) => quiz.language === "vi" ? "alphabet-vietnamese" : "alphabet-english",
    },
  } satisfies Record<ContentV2Quiz["type"], QuizDefinition>,
  questions: {
    "competition-question": { managerType: "question" },
    "alphabet-letter": { managerType: "alphabet" },
  } satisfies Record<ContentV2Question["type"], { managerType: "question" | "alphabet" }>,
};

function managerSettings(topic: RepositorySnapshot["contentV2"]["topics"][number]): ContestSettings {
  const definition = contentV2ManagerRegistry.topics[topic.type];
  return {
    book: {
      code: topic.id,
      title: topic.title,
      description: topic.description,
      subject: definition.subject,
      isActive: true,
    },
    rounds: topic.rounds?.map((round) => ({
      roundCode: round.id.toUpperCase(),
      roundName: round.title,
      description: "",
    })) ?? [{ roundCode: "MAIN", roundName: "Main Round", description: "" }],
    grades: topic.gradeGroups?.map((group) => ({
      gradeName: group.title,
      grades: group.grades,
    })) ?? [{ gradeName: "K", grades: [0] }],
    categories: [],
    quizRules: [],
  };
}

export function adaptContentV2Snapshot(snapshot: RepositorySnapshot): RepositorySnapshot {
  const contests: ContestSummary[] = snapshot.contentV2.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    subject: contentV2ManagerRegistry.topics[topic.type].subject,
    isActive: true,
    settingsPath: topic.filePath,
    settings: managerSettings(topic),
  }));
  const quizzes: QuizSummary[] = snapshot.contentV2.quizzes.map((quiz) => ({
    key: quiz.key,
    relativePath: `content-v2/topics/${quiz.topicId}/quizzes/${quiz.id}`,
    manifestPath: quiz.filePath,
    id: quiz.id,
    legacyId: quiz.id,
    contest: quiz.topicId,
    title: quiz.title,
    type: contentV2ManagerRegistry.quizzes[quiz.type].managerType(quiz),
    grade: quiz.grade ?? null,
    round: quiz.round ?? null,
    year: quiz.year ?? null,
    contentStatus: quiz.status === "reviewed" ? "reviewed" : "generated",
    deploymentStatus: !quiz.publishedHash ? "not-uploaded" : quiz.publishedHash === quiz.localHash ? "uploaded" : "outdated",
    hasSourcePdf: false,
    hasRawJson: false,
    hasQuizTs: false,
    questionStorageVersion: "questions-v1",
    hasGeneratedArtifact: false,
    artifactHash: null,
    publishedHash: quiz.publishedHash,
    publishedAt: quiz.publishedAt,
    localContentHash: quiz.localHash,
    questionCount: quiz.questionCount,
    reviewedQuestionCount: quiz.reviewedQuestionCount,
    migrationErrorCount: 0,
    quizBuilderApiVersion: 1,
    modifiedAt: snapshot.scannedAt,
  }));
  return { ...snapshot, contests, quizzes };
}

function questionNumber(id: string, order: number): number {
  const match = id.match(/^(?:q|letter-)(\d+)$/i);
  return Number(match?.[1] ?? order + 1);
}

function toManagerQuestion(question: ContentV2Question): QuizQuestionRecord {
  if (question.type === "alphabet-letter")
    return {
      type: "alphabet",
      question_no: questionNumber(question.id, question.order),
      letter: question.letter,
      uppercase: question.uppercase,
      lowercase: question.lowercase,
      ...(question.pronunciation ? { pronunciation: question.pronunciation } : {}),
      ...(question.status === "reviewed" ? { status: "verified" } : question.status === "rejected" ? { status: "rejected" } : {}),
    };
  return {
    question_no: questionNumber(question.id, question.order),
    category: question.category,
    text_en: question.text.en,
    text_vn: question.text.vi,
    image_datas: question.assets,
    answer: question.answer,
    explanation: question.explanation,
    feedback: question.feedback,
    ...(question.dynamic ? { authoringMode: "advanced-dynamic", advancedDynamic: question.dynamic } : {}),
    ...(question.status === "reviewed" ? { status: "verified" } : question.status === "rejected" ? { status: "rejected" } : {}),
  };
}

function reviewStatus(question: QuizQuestionRecord): "pending" | "reviewed" | "rejected" {
  return question.status === "verified" ? "reviewed" : question.status === "rejected" ? "rejected" : "pending";
}

function fromManagerQuestion(stored: ContentV2Question, question: QuizQuestionRecord): ContentV2Question {
  if (stored.type === "alphabet-letter" && question.type === "alphabet")
    return { ...stored, status: reviewStatus(question), letter: question.letter, uppercase: question.uppercase, lowercase: question.lowercase, pronunciation: question.pronunciation || undefined };
  if (stored.type !== "competition-question" || question.type === "alphabet")
    throw new Error("Question type does not match its stored v2 contract.");
  const dynamic = question.advancedDynamic;
  return {
    ...stored,
    status: reviewStatus(question),
    category: typeof question.category === "string" && question.category ? question.category : undefined,
    text: { en: (question.text_en ?? "") as string | string[], ...(question.text_vn ? { vi: question.text_vn as string | string[] } : {}) },
    assets: Array.isArray(question.image_datas) ? question.image_datas.filter((value): value is string => typeof value === "string" && value.startsWith("asset:")) : [],
    answer: (question.answer ?? {}) as Record<string, unknown>,
    explanation: question.explanation as { en: string; vi?: string } | undefined,
    feedback: question.feedback,
    dynamic: dynamic ? { paramsGeneratorTs: dynamic.paramsGeneratorTs, questionGeneratorTs: dynamic.questionGeneratorTs, originParamsTs: dynamic.originParamsTs, explanationGeneratorTs: dynamic.explanationGeneratorTs } : undefined,
  };
}

function findQuiz(snapshot: RepositorySnapshot, manifestPath: string) {
  const quiz = snapshot.contentV2.quizzes.find((item) => item.filePath === manifestPath);
  if (!quiz) throw new Error("The v2 quiz is no longer available.");
  return quiz;
}

function findQuestionSummary(snapshot: RepositorySnapshot, topicId: string, quizId: string, number: string | number) {
  const value = String(number);
  const summary = snapshot.contentV2.questions.find((item) => item.topicId === topicId && item.quizId === quizId && (item.id === value || String(questionNumber(item.id, item.order)) === value));
  if (!summary) throw new Error(`Question ${value} was not found.`);
  return summary;
}

export function ContentV2QuizManager(props: Props) {
  const managerSnapshot = useMemo(() => adaptContentV2Snapshot(props.snapshot), [props.snapshot]);
  const api = useMemo<QuizManagerApi>(() => {
    const refresh = (next: RepositorySnapshot) => {
      props.onSnapshotChange(next);
      return adaptContentV2Snapshot(next);
    };
    const loadQuestions = async (manifestPath: string) => {
      const quiz = findQuiz(props.snapshot, manifestPath);
      const summaries = props.snapshot.contentV2.questions.filter((item) => item.topicId === quiz.topicId && item.quizId === quiz.id).sort((a, b) => a.order - b.order);
      return Promise.all(summaries.map(async (item) => toManagerQuestion(await window.getgo.loadContentV2Question(quiz.topicId, quiz.id, item.id))));
    };
    return {
      getAiMigrationJobs: async () => ({ concurrency: 0, jobs: [] }),
      migrateLegacyQuizzes: async () => ({ snapshot: managerSnapshot, migratedQuizIds: [], failures: [] }),
      startAiMigrationJob: async () => { throw new Error("These questions already use content v2."); },
      showInFolder: window.getgo.showInFolder,
      showQuizQuestionInFolder: async (manifestPath, number) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const question = findQuestionSummary(props.snapshot, quiz.topicId, quiz.id, number);
        await window.getgo.showInFolder(question.filePath);
      },
      loadQuizQuestions: loadQuestions,
      loadAlphabetDictionary: async (manifestPath) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const resources = await window.getgo.loadContentV2QuizResources(quiz.topicId, quiz.id);
        return (resources.dictionary ?? { schemaVersion: 1, words: [] }) as AlphabetDictionary;
      },
      saveQuizQuestion: async (manifestPath, question) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const summary = findQuestionSummary(props.snapshot, quiz.topicId, quiz.id, question.question_no);
        const stored = await window.getgo.loadContentV2Question(quiz.topicId, quiz.id, summary.id);
        const next = fromManagerQuestion(stored, question);
        refresh(await window.getgo.saveContentV2Question(quiz.topicId, quiz.id, next));
        return toManagerQuestion(next);
      },
      markAllQuizQuestionsReviewed: async (manifestPath) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const next = await window.getgo.markAllContentV2QuizQuestionsReviewed(
          quiz.topicId,
          quiz.id,
        );
        props.onSnapshotChange(next);
        return loadQuestions(manifestPath);
      },
      resetQuizQuestion: async (manifestPath, question) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const summary = findQuestionSummary(props.snapshot, quiz.topicId, quiz.id, question.question_no);
        return toManagerQuestion(await window.getgo.loadContentV2Question(quiz.topicId, quiz.id, summary.id));
      },
      createQuizQuestion: async (manifestPath) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const order = props.snapshot.contentV2.questions.filter((item) => item.topicId === quiz.topicId && item.quizId === quiz.id).length;
        const id = `q${order + 1}`;
        const record: ContentV2Question = quiz.type === "alphabet-course"
          ? { schemaVersion: 2, id: `letter-${order + 1}`, type: "alphabet-letter", order, status: "pending", letter: "?", uppercase: "?", lowercase: "?" }
          : { schemaVersion: 2, id, type: "competition-question", order, status: "pending", text: { en: "New question" }, assets: [], answer: { type: "input", correct: "" } };
        const next = await window.getgo.saveContentV2Question(quiz.topicId, quiz.id, record);
        return { question: toManagerQuestion(record), snapshot: refresh(next) };
      },
      deleteQuizQuestion: async (manifestPath, number) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        const summary = findQuestionSummary(props.snapshot, quiz.topicId, quiz.id, number);
        const next = await window.getgo.deleteContentV2Question(quiz.topicId, quiz.id, summary.id);
        props.onSnapshotChange(next);
        const adapted = adaptContentV2Snapshot(next);
        const nextQuiz = findQuiz(next, manifestPath);
        const questions = await Promise.all(next.contentV2.questions.filter((item) => item.topicId === nextQuiz.topicId && item.quizId === nextQuiz.id).sort((a, b) => a.order - b.order).map(async (item) => toManagerQuestion(await window.getgo.loadContentV2Question(nextQuiz.topicId, nextQuiz.id, item.id))));
        return { questions, snapshot: adapted };
      },
      reorderQuizQuestions: async (manifestPath, numbers) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        let latest = props.snapshot;
        const records: QuizQuestionRecord[] = [];
        for (const [order, number] of numbers.entries()) {
          const summary = findQuestionSummary(props.snapshot, quiz.topicId, quiz.id, number);
          const stored = await window.getgo.loadContentV2Question(quiz.topicId, quiz.id, summary.id);
          const next = { ...stored, order } as ContentV2Question;
          latest = await window.getgo.saveContentV2Question(quiz.topicId, quiz.id, next);
          records.push(toManagerQuestion(next));
        }
        return { questions: records, snapshot: refresh(latest) };
      },
      publishQuiz: async (topicId, quizId) => {
        const result = await window.getgo.publishContentV2Quiz(topicId, quizId);
        const next = result.snapshot ?? props.snapshot;
        refresh(next);
        const quiz = next.contentV2.quizzes.find((item) => item.topicId === topicId && item.id === quizId);
        return { contestId: topicId, quizId, contentHash: result.contentHash, questionCount: quiz?.questionCount ?? 0, publishedAt: result.publishedAt };
      },
      deleteQuiz: async (manifestPath) => {
        const quiz = findQuiz(props.snapshot, manifestPath);
        return refresh(await window.getgo.deleteContentV2Quiz(quiz.topicId, quiz.id));
      },
      updateQuiz: async (manifestPath, input) => {
        const summary = findQuiz(props.snapshot, manifestPath);
        const stored = await window.getgo.loadContentV2Quiz(summary.topicId, summary.id);
        const next: ContentV2Quiz = stored.type === "competition-paper"
          ? { ...stored, title: input.title, grade: input.grade ?? stored.grade, round: input.round ?? stored.round, year: input.year ?? stored.year, status: input.status === "reviewed" ? "reviewed" : stored.status }
          : { ...stored, title: input.title, language: input.type === "alphabet-vietnamese" ? "vi" : input.type === "alphabet-english" ? "en" : stored.language };
        return refresh(await window.getgo.saveContentV2Quiz(summary.topicId, next));
      },
      createQuiz: async (topicId, input: QuizCrudInput) => {
        const topic = await window.getgo.loadContentV2Topic(topicId);
        const order = props.snapshot.contentV2.quizzes.filter((item) => item.topicId === topicId).length;
        const quiz: ContentV2Quiz = topic.type === "alphabet-learning"
          ? { schemaVersion: 2, id: input.id, topicId, type: "alphabet-course", title: input.title, description: "", status: "pending", order, language: input.type === "alphabet-vietnamese" ? "vi" : "en", dictionary: "resources/dictionary.json" }
          : { schemaVersion: 2, id: input.id, topicId, type: "competition-paper", title: input.title, description: "", status: "pending", order, grade: input.grade ?? "Unknown", round: input.round ?? "main", year: input.year ?? "Unknown" };
        return refresh(await window.getgo.saveContentV2Quiz(topicId, quiz));
      },
      createContest: async (settings) => {
        const order = props.snapshot.contentV2.topics.length;
        const topic: ContentV2Topic = settings.book.subject === 2
          ? { schemaVersion: 2, id: settings.book.code, type: "alphabet-learning", title: settings.book.title, description: settings.book.description ?? "", status: "pending", order, supportedLanguages: ["en", "vi"], recommendedAgeRange: { minimum: 3, maximum: 7 } }
          : { schemaVersion: 2, id: settings.book.code, type: "competition", title: settings.book.title, description: settings.book.description ?? "", status: "pending", order, subject: "mathematics", rounds: [], gradeGroups: [] };
        return refresh(await window.getgo.saveContentV2Topic(topic));
      },
      updateContest: async (id, settings) => {
        const stored = await window.getgo.loadContentV2Topic(id);
        const next: ContentV2Topic = stored.type === "competition"
          ? {
              ...stored,
              title: settings.book.title,
              description: settings.book.description ?? "",
              rounds: settings.rounds.map((round, index) => ({
                id: String(round.roundCode ?? `round-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `round-${index + 1}`,
                title: String(round.roundName ?? round.roundCode ?? `Round ${index + 1}`),
              })),
              gradeGroups: settings.grades.map((grade, index) => ({
                id: `grade-${index + 1}`,
                title: String(grade.gradeName ?? `Grade ${index + 1}`),
                grades: Array.isArray(grade.grades) ? grade.grades.filter((value): value is number => typeof value === "number") : [],
              })),
            }
          : { ...stored, title: settings.book.title, description: settings.book.description ?? "" };
        return refresh(await window.getgo.saveContentV2Topic(next));
      },
      deleteContest: async (id) => refresh(await window.getgo.deleteContentV2Topic(id)),
    };
  }, [managerSnapshot, props]);
  return <QuizManager locale={props.locale} speechSettings={props.speechSettings} snapshot={managerSnapshot} initialRoute={props.initialRoute} onSnapshotChange={() => undefined} onRouteChange={props.onRouteChange} onBackActionChange={props.onBackActionChange} onSpeechSettingsChange={props.onSpeechSettingsChange} api={api} routeMode="topics" />;
}
