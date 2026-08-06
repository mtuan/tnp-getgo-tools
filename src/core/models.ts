export const contentStatuses = [
  "imported",
  "normalized",
  "generated",
  "reviewed",
  "validated",
  "published",
] as const;

export type ContentStatus = (typeof contentStatuses)[number];
export type DeploymentStatus =
  "not-built" | "not-uploaded" | "uploaded" | "outdated" | "unknown";
export type QuestionStorageVersion = "legacy" | "questions-v1";
export const quizTypes = [
  "question-list",
  "alphabet-english",
  "alphabet-vietnamese",
] as const;
export type QuizType = (typeof quizTypes)[number];

export interface QuizManifest {
  schemaVersion: number;
  id: string;
  legacyId: string;
  contest: string;
  title?: string;
  type?: QuizType;
  grade?: string | null;
  round?: string | null;
  year?: string | null;
  status: ContentStatus;
  source: { format: string; rawJsonSha256: string; quizTsSha256: string };
  quizBuilderApiVersion?: number;
  questionStorageVersion?: "questions-v1";
  publishedHash?: string;
  publishedAt?: string;
}

export interface QuizSummary {
  key: string;
  relativePath: string;
  manifestPath: string;
  id: string;
  legacyId: string;
  contest: string;
  title: string;
  type: QuizType;
  grade: string | null;
  round: string | null;
  year: string | null;
  contentStatus: ContentStatus;
  deploymentStatus: DeploymentStatus;
  hasSourcePdf: boolean;
  hasRawJson: boolean;
  hasQuizTs: boolean;
  questionStorageVersion: QuestionStorageVersion;
  hasGeneratedArtifact: boolean;
  artifactHash: string | null;
  publishedHash: string | null;
  publishedAt: string | null;
  /** Hash of the cached, sanitized runtime questions. Calculated on the initial
   * repository scan and maintained incrementally by Tools mutations. */
  localContentHash: string | null;
  questionCount: number | null;
  reviewedQuestionCount: number;
  migrationErrorCount: number;
  aiMigrationJob?: QuizAiMigrationJob | null;
  quizBuilderApiVersion: number | null;
  modifiedAt: string;
}

export interface ScanIssue {
  path: string;
  message: string;
}

export interface RepositorySnapshot {
  repositoryPath: string;
  scannedAt: string;
  contests: ContestSummary[];
  quizzes: QuizSummary[];
  issues: ScanIssue[];
  contentV2: ContentV2Snapshot;
}

export interface ContentV2TopicSummary {
  id: string;
  type: "competition" | "alphabet-learning";
  title: string;
  description: string;
  status: "draft" | "pending" | "reviewed" | "rejected";
  order: number;
  filePath: string;
  localHash: string;
  publishedHash: string | null;
  publishedAt: string | null;
  quizCount: number;
  subject?: string;
  rounds?: Array<{ id: string; title: string }>;
  gradeGroups?: Array<{ id: string; title: string; grades: number[] }>;
  supportedLanguages?: Array<"en" | "vi">;
  recommendedAgeRange?: { minimum: number; maximum: number };
}

export interface ContentV2QuizSummary {
  key: string;
  topicId: string;
  id: string;
  type: "competition-paper" | "alphabet-course";
  title: string;
  description: string;
  status: "draft" | "pending" | "reviewed" | "rejected";
  order: number;
  filePath: string;
  localHash: string;
  publishedHash: string | null;
  publishedAt: string | null;
  questionCount: number;
  reviewedQuestionCount: number;
  grade?: string;
  round?: string;
  year?: string;
  language?: "en" | "vi";
}

export interface ContentV2QuestionSummary {
  key: string;
  topicId: string;
  quizId: string;
  id: string;
  type: "competition-question" | "alphabet-letter";
  order: number;
  status: "draft" | "pending" | "reviewed" | "rejected";
  filePath: string;
  localHash: string;
  label: string;
  category?: string;
  hasImages?: boolean;
  dynamic?: boolean;
}

export interface ContentV2Snapshot {
  topics: ContentV2TopicSummary[];
  quizzes: ContentV2QuizSummary[];
  questions: ContentV2QuestionSummary[];
  issues: ScanIssue[];
}

export interface QuizMigrationResult {
  snapshot: RepositorySnapshot;
  migratedQuizIds: string[];
  failures: Array<{ quizId: string; message: string }>;
}

export interface ContestSettings {
  $schema?: string;
  $comment?: string;
  book: {
    code: string;
    title: string;
    description?: string;
    subject: number;
    isActive?: boolean;
  };
  rounds: Array<Record<string, unknown>>;
  grades: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  quizRules?: Array<Record<string, unknown>>;
}

export interface ContestSummary {
  id: string;
  title: string;
  description: string;
  subject: number;
  isActive: boolean;
  settingsPath: string;
  settings: ContestSettings;
}

export interface QuizCrudInput {
  id: string;
  title: string;
  type?: QuizType;
  grade: string | null;
  round: string | null;
  year: string | null;
  status?: ContentStatus;
  quizBuilderApiVersion?: number;
}

export interface QuestionRecordBase extends Record<string, unknown> {
  question_no: number | string;
  status?: string;
  /** @deprecated Legacy compatibility only. Use status. */
  verified?: boolean;
  feedback?: QuestionFeedback;
}

export interface ContestQuizQuestionRecord extends QuestionRecordBase {
  type?: "question";
  category?: string;
  text_en?: unknown;
  text_vn?: unknown;
  action?: "generated";
  migrationError?: { stage: "origin-render"; message: string };
  authoringMode?: string;
  advancedDynamic?: {
    paramsGeneratorTs: string;
    questionGeneratorTs: string;
    originParamsTs: string;
    explanationGeneratorTs: string;
    [key: string]: unknown;
  };
  aiResponse?: DynamicQuestionProposalResult & {
    generatedAt: string;
    processingTimeMs?: number;
  };
  aiFixHistory?: Array<
    DynamicQuestionFixResult & {
      generatedAt: string;
      processingTimeMs?: number;
      proposal: DynamicQuestionProposal;
    }
  >;
  letter?: never;
  uppercase?: never;
  lowercase?: never;
  pronunciation?: never;
  samples?: unknown;
}

export interface AlphabetSample {
  text: string;
  classifier?: string;
  meaning?: string;
  image?: string;
  minimumAge: number;
}

export interface AlphabetDictionary {
  schemaVersion: 1;
  words: AlphabetSample[];
}

export interface AlphabetQuestionContent {
  letter: string;
  uppercase: string;
  lowercase: string;
  pronunciation?: string;
}

export interface AlphabetQuestionRecord
  extends QuestionRecordBase, AlphabetQuestionContent {
  type: "alphabet";
  category?: never;
  text_en?: never;
  text_vn?: never;
  answer?: never;
  image_datas?: never;
  explanation?: never;
  authoringMode?: never;
  advancedDynamic?: never;
  aiResponse?: never;
  aiFixHistory?: never;
  samples?: never;
}

export type QuizQuestionRecord =
  ContestQuizQuestionRecord | AlphabetQuestionRecord;

export type QuestionIssue = "missing-image" | "wrong-question" | "wrong-answer";
export interface QuestionFeedback {
  issues: QuestionIssue[];
  note?: string;
  updatedAt: string;
}

export const supportedQuizBuilderApiVersions = [1] as const;

export type SpeechLanguage = "en" | "vi";
export interface SpeechLanguageSettings {
  voiceURI: string;
  letterRate: number;
  wordRate: number;
  meaningRate: number;
  pauseMs: number;
}

export interface AppSettings {
  repositoryPath: string | null;
  environment: "development" | "staging" | "production";
  aiProfile: "thorough" | "fast";
  locale: "en" | "vi";
  speech: Record<SpeechLanguage, SpeechLanguageSettings>;
}

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
}

export interface AuthState {
  user: AuthUser | null;
}

export interface EnvironmentReadinessCheck {
  id: "configuration" | "authentication";
  ready: boolean;
  message: string;
}

export interface EnvironmentReadiness {
  environment: AppSettings["environment"];
  projectId: string | null;
  ready: boolean;
  checks: EnvironmentReadinessCheck[];
}

export type PublishingStatus =
  "not-published" | "up-to-date" | "changed" | "local-error" | "remote-error";

export interface PublishableQuiz {
  contestId: string;
  quizId: string;
  title: string;
  grade: string | null;
  round: string | null;
  year: string | null;
  questionCount: number;
  contentHash: string;
}

export interface PublishingQuizStatus {
  contestId: string;
  quizId: string;
  title: string;
  grade: string | null;
  round: string | null;
  year: string | null;
  questionCount: number | null;
  contentHash: string | null;
  publishedHash: string | null;
  publishedAt: string | null;
  status: PublishingStatus;
  error?: string;
}

export interface PublishingSnapshot {
  environment: AppSettings["environment"];
  projectId: string;
  scannedAt: string;
  quizzes: PublishingQuizStatus[];
}

export interface PublishResult {
  contestId: string;
  quizId: string;
  contentHash: string;
  questionCount: number;
  publishedAt: string;
}

export interface ContentV2PublishResult {
  kind: "topic" | "quiz";
  topicId: string;
  quizId?: string;
  contentHash: string;
  publishedAt: string;
  snapshot?: RepositorySnapshot;
}

export interface ContentV2QuizPublishPreview {
  firestore: {
    quizDocument: {
      operation: "upsert";
      path: string;
      data: Record<string, unknown>;
    };
    questionDocuments: Array<{
      operation: "upsert";
      path: string;
      data: Record<string, unknown>;
    }>;
    resourceDocuments: Array<{
      operation: "upsert";
      path: string;
      data: Record<string, unknown>;
    }>;
    cleanup: string[];
  };
  firebaseStorage: {
    uploads: Array<{
      operation: "upload";
      reference: string;
      localSourcePath: string;
      destinationPath: string;
      contentHash: string;
      mimeType: string;
    }>;
  };
}

export type AiMigrationJobStatus =
  "queued" | "running" | "paused" | "completed" | "cancelled" | "failed";
export interface AiMigrationJob {
  id: string;
  contestId: string;
  quizId: string;
  quizTitle: string;
  manifestPath: string;
  context: Record<string, unknown>;
  status: AiMigrationJobStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  skippedImages: number;
  skippedVerified: number;
  currentQuestion?: string;
  errors: Array<{ questionNo: string; message: string }>;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export type QuizAiMigrationJob = Omit<
  AiMigrationJob,
  "manifestPath" | "context"
>;

export interface AiMigrationJobsSnapshot {
  concurrency: number;
  jobs: AiMigrationJob[];
}

export type BackgroundJobKind = "ai-migrate" | "publish" | "deploy";
export type WebDeploymentTarget = "development" | "staging" | "production";
export type DeploymentComponent = "firebase-rules" | "web";
export interface BackgroundJob {
  id: string;
  kind: BackgroundJobKind;
  name: string;
  description: string;
  status: AiMigrationJobStatus;
  completed: number;
  total: number;
  progressLabel?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  route?: string;
  cancellable: boolean;
  error?: string;
}
export interface BackgroundJobsSnapshot {
  aiConcurrency: number;
  jobs: BackgroundJob[];
}

export type DynamicQuestionProposal = GetGoDynamicQuestionProposal;
export type DynamicQuestionProposalResult = GetGoDynamicQuestionProposalResult;
export type DynamicQuestionFixResult = GetGoDynamicQuestionFixResult;

export interface DesktopApi {
  restartApp(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  chooseRepository(): Promise<RepositorySnapshot | null>;
  scanRepository(path?: string, force?: boolean): Promise<RepositorySnapshot>;
  loadContentV2Topic(topicId: string): Promise<ContentV2Topic>;
  loadContentV2Quiz(topicId: string, quizId: string): Promise<ContentV2Quiz>;
  loadContentV2Question(
    topicId: string,
    quizId: string,
    questionId: string,
  ): Promise<ContentV2Question>;
  loadContentV2QuizResources(
    topicId: string,
    quizId: string,
  ): Promise<Record<string, unknown>>;
  saveContentV2Topic(topic: ContentV2Topic): Promise<RepositorySnapshot>;
  saveContentV2Quiz(
    topicId: string,
    quiz: ContentV2Quiz,
  ): Promise<RepositorySnapshot>;
  saveContentV2Question(
    topicId: string,
    quizId: string,
    question: ContentV2Question,
  ): Promise<RepositorySnapshot>;
  deleteContentV2Topic(topicId: string): Promise<RepositorySnapshot>;
  deleteContentV2Quiz(
    topicId: string,
    quizId: string,
  ): Promise<RepositorySnapshot>;
  deleteContentV2Question(
    topicId: string,
    quizId: string,
    questionId: string,
  ): Promise<RepositorySnapshot>;
  setEnvironment(environment: AppSettings["environment"]): Promise<AppSettings>;
  setAiProfile(profile: AppSettings["aiProfile"]): Promise<AppSettings>;
  setLocale(locale: AppSettings["locale"]): Promise<AppSettings>;
  setSpeechSettings(
    language: SpeechLanguage,
    settings: SpeechLanguageSettings,
  ): Promise<AppSettings>;
  checkEnvironmentReadiness(): Promise<EnvironmentReadiness>;
  getPublishingStatus(): Promise<PublishingSnapshot>;
  publishQuiz(contestId: string, quizId: string): Promise<PublishResult>;
  publishContentV2Topic(topicId: string): Promise<ContentV2PublishResult>;
  publishContentV2Quiz(
    topicId: string,
    quizId: string,
  ): Promise<ContentV2PublishResult>;
  previewContentV2QuizPublish(
    topicId: string,
    quizId: string,
  ): Promise<ContentV2QuizPublishPreview>;
  showInFolder(path: string): Promise<void>;
  showQuizQuestionInFolder(
    manifestPath: string,
    questionNo: number | string,
  ): Promise<void>;
  readQuizAsset(manifestPath: string, assetReference: string): Promise<string>;
  readQuizSource(manifestPath: string): Promise<string>;
  saveQuizSource(manifestPath: string, source: string): Promise<void>;
  loadQuizQuestions(manifestPath: string): Promise<QuizQuestionRecord[]>;
  loadAlphabetDictionary(manifestPath: string): Promise<AlphabetDictionary>;
  migrateLegacyQuizzes(contestId: string): Promise<QuizMigrationResult>;
  saveQuizQuestion(
    manifestPath: string,
    question: QuizQuestionRecord,
  ): Promise<QuizQuestionRecord>;
  markAllQuizQuestionsReviewed(
    manifestPath: string,
  ): Promise<QuizQuestionRecord[]>;
  markAllContentV2QuizQuestionsReviewed(
    topicId: string,
    quizId: string,
  ): Promise<RepositorySnapshot>;
  createQuizQuestion(
    manifestPath: string,
  ): Promise<{ question: QuizQuestionRecord; snapshot: RepositorySnapshot }>;
  reorderQuizQuestions(
    manifestPath: string,
    questionNumbers: string[],
  ): Promise<{ questions: QuizQuestionRecord[]; snapshot: RepositorySnapshot }>;
  deleteQuizQuestion(
    manifestPath: string,
    questionNo: string,
  ): Promise<{ questions: QuizQuestionRecord[]; snapshot: RepositorySnapshot }>;
  resetQuizQuestion(
    manifestPath: string,
    question: QuizQuestionRecord,
  ): Promise<QuizQuestionRecord>;
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  createContest(settings: ContestSettings): Promise<RepositorySnapshot>;
  updateContest(
    id: string,
    settings: ContestSettings,
  ): Promise<RepositorySnapshot>;
  renameContest(currentId: string, nextId: string): Promise<RepositorySnapshot>;
  deleteContest(id: string): Promise<RepositorySnapshot>;
  createQuiz(
    contest: string,
    input: QuizCrudInput,
  ): Promise<RepositorySnapshot>;
  updateQuiz(
    manifestPath: string,
    input: Omit<QuizCrudInput, "id">,
  ): Promise<RepositorySnapshot>;
  deleteQuiz(manifestPath: string): Promise<RepositorySnapshot>;
  getAuthState(): Promise<AuthState>;
  signIn(email: string, password: string): Promise<AuthState>;
  signInWithProvider(
    provider: "google" | "facebook" | "apple",
  ): Promise<AuthState>;
  signOut(): Promise<AuthState>;
  changePassword(password: string): Promise<void>;
  createDynamicQuestionProposal(input: {
    question: QuizQuestionRecord;
    context?: Record<string, unknown>;
    instructions?: string;
  }): Promise<DynamicQuestionProposalResult>;
  fixDynamicQuestion(input: {
    originalQuestion: QuizQuestionRecord;
    currentCode: NonNullable<QuizQuestionRecord["advancedDynamic"]>;
    currentSummary: GetGoDynamicQuestionSummary;
    context?: Record<string, unknown>;
    diagnostics?: string[];
    instructions: string;
  }): Promise<DynamicQuestionFixResult>;
  cancelDynamicQuestionAi(): Promise<void>;
  startAiMigrationJob(input: {
    manifestPath: string;
    context: Record<string, unknown>;
  }): Promise<AiMigrationJob>;
  getAiMigrationJobs(): Promise<AiMigrationJobsSnapshot>;
  getBackgroundJobs(): Promise<BackgroundJobsSnapshot>;
  startDeployment(
    component: DeploymentComponent,
    target: WebDeploymentTarget,
  ): Promise<BackgroundJobsSnapshot>;
  cancelBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  pauseBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  resumeBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  setAiMigrationConcurrency(
    concurrency: number,
  ): Promise<AiMigrationJobsSnapshot>;
  cancelAiMigrationJob(jobId: string): Promise<AiMigrationJobsSnapshot>;
}
import type {
  GetGoDynamicQuestionProposal,
  GetGoDynamicQuestionProposalResult,
  GetGoDynamicQuestionFixResult,
  GetGoDynamicQuestionSummary,
} from "@tnp/getgo-logics/authoring";
import type {
  ContentV2Question,
  ContentV2Quiz,
  ContentV2Topic,
} from "./content-v2.js";
