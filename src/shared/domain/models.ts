export const contentStatuses = [
  "imported",
  "normalized",
  "generated",
  "reviewed",
  "validated",
  "published",
] as const;

export type ContentStatus = (typeof contentStatuses)[number]; export type DeploymentStatus =
  "not-built" | "not-uploaded" | "uploaded" | "outdated" | "unknown";
export type QuestionStorageVersion = "legacy" | "questions-v1";
export const quizTypes = [
  "contest",
  "alphabet",
  "pronunciation",
] as const;
export type QuizType = (typeof quizTypes)[number];

export interface QuizManifest {
  schemaVersion: number;
  id: string;
  legacyId: string;
  contest: string;
  title?: string;
  icon?: string;
  type?: QuizType;
  language?: "en" | "vi";
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
  icon?: string;
  sharedCode?: string;
  type: QuizType;
  language?: "en" | "vi";
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
  publishedAt: string | null; marketplace?: import("../../features/topics/domain/content-v2.js").MarketplaceTopicMetadataInput;
  /** Hash of the current sanitized file content. */
  localContentHash: string | null;
  questionCount: number | null;
  reviewedQuestionCount: number;
  migrationErrorCount: number;
  aiMigrationJob?: QuizAiMigrationJob | null;
  quizBuilderApiVersion: number | null;
  modifiedAt: string;
}

export interface FileLoadIssue {
  path: string;
  message: string;
}

export interface RepositoryViewData {
  repositoryPath: string;
  loadedAt: string;
  contests: ContestSummary[];
  quizzes: QuizSummary[];
  issues: FileLoadIssue[];
  contentV2: ContentV2Snapshot;
}

export interface ContentV2TopicSummary {
  id: string;
  type: "competition" | "kid-learning";
  title: string;
  description: string;
  icon?: string;
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
  marketplace?: import("../../features/topics/domain/content-v2.js").MarketplaceTopicMetadataInput;
  marketplaceLocalHash?: string;
  marketplacePublishedHash?: string | null;
  marketplacePublishedAt?: string | null;
}

export interface MarketplaceTopicPublishResult {
  topicId: string;
  state: import("../../features/topics/domain/content-v2.js").MarketplaceTopicState;
  contentHash: string;
  publishedAt: string;
}

export interface MarketplaceStateUpdateResult {
  target: "topics" | "quizzes";
  topicId?: string;
  records: Array<{
    id: string;
    state: import("../../features/topics/domain/content-v2.js").MarketplaceTopicState;
    marketplace?: import("../../features/topics/domain/content-v2.js").MarketplaceTopicMetadataInput;
    marketplaceLocalHash?: string;
  }>;
}

export interface ContentV2QuizSummary {
  key: string;
  topicId: string;
  id: string;
  type: "competition-paper" | "alphabet" | "spelling" | "pronunciation";
  title: string;
  description: string;
  icon?: string;
  sharedCode: string;
  status: "draft" | "pending" | "reviewed" | "rejected";
  order: number;
  filePath: string;
  hasSourcePdf: boolean;
  localHash: string;
  publishedHash: string | null;
  publishedAt: string | null; marketplace?: import("../../features/topics/domain/content-v2.js").MarketplaceTopicMetadataInput;
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
  type: "competition-question" | "alphabet-letter" | "pronunciation-sound";
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
  issues: FileLoadIssue[];
}

export interface ContentV2RouteData {
  repositoryPath: string;
  loadedAt: string;
  content: ContentV2Snapshot;
}

export interface QuizMigrationResult {
  snapshot: RepositoryViewData;
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
    icon?: string;
    /** Content V2 topic kind. Omitted by legacy contest settings. */
    topicType?: "competition" | "kid-learning";
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
  icon?: string;
  sharedCode?: string;
  type?: QuizType;
  language?: "en" | "vi";
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
  reference?: {
    questionNo: number;
  };
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
  uppercase?: never;
  lowercase?: never;
  pronunciation?: never;
  samples?: unknown;
}

export interface AlphabetSample {
  text: string;
  aliases?: Array<{
    text: string;
    classifier?: string;
    spelling?: string;
    pronunciation?: string;
    meaning?: string;
  }>;
  classifier?: string;
  spelling?: string;
  pronunciation?: string;
  meaning?: string;
  image?: string;
  minimumAge: number;
}

export interface AlphabetDictionary {
  schemaVersion: 1;
  words: AlphabetSample[];
}

export interface KidLearningDictionaryEntry {
  id: string;
  reviewed?: boolean; image?: string;
  audio?: string;
  minimumAge: number;
  translations: Partial<Record<"en" | "vi", Omit<AlphabetSample, "image" | "minimumAge">>>;
}

export interface KidLearningDictionary {
  schemaVersion: 2;
  entries: KidLearningDictionaryEntry[];
}

export interface ContentV2TopicAssetSummary {
  filename: string;
  size: number;
  mimeType: string;
}

export interface AlphabetQuestionContent {
  letter: string;
  uppercase: string;
  lowercase: string;
  pronunciation?: string;
  resources: AlphabetLetterResource[];
}

export interface AlphabetLetterResource {
  id: string;
  title: string;
  url: string;
  description?: string;
  durationSeconds?: number;
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

export interface PronunciationCell {
  text: string;
  speech?: string;
  audio?: string;
}

export interface PronunciationSoundQuestionRecord extends QuestionRecordBase {
  type: "pronunciation-sound";
  title?: string;
  letter: PronunciationCell;
  tones: PronunciationCell[];
  sounds: Array<{ sound: PronunciationCell; forms: PronunciationCell[] }>;
  category?: never;
  text_en?: never;
  text_vn?: never;
  answer?: never;
  image_datas?: never;
  explanation?: never;
  authoringMode?: never;
  reference?: never;
  advancedDynamic?: never;
  aiResponse?: never;
  aiFixHistory?: never;
  samples?: never;
}

export type QuizQuestionRecord =
  ContestQuizQuestionRecord | AlphabetQuestionRecord | PronunciationSoundQuestionRecord;

export type QuestionIssue = "missing-image" | "wrong-question" | "wrong-answer";
export interface QuestionFeedback {
  issues: QuestionIssue[];
  note?: string;
  updatedAt: string;
}

export type SyncedQuestionFeedbackStatus = "pending" | "fixed" | "ignored";

export interface SyncedQuestionFeedback {
  schemaVersion: 1;
  id: string;
  source: {
    projectId: string;
    topicId: string;
    quizId: string;
    questionId: string;
    issueTypes: string[];
    comment: string | null;
    params: Record<string, unknown> | null;
    reportedAt: string;
    reportedBy: string;
  };
  review: {
    status: SyncedQuestionFeedbackStatus;
    note: string | null;
    updatedAt: string | null;
  };
}

export interface QuestionFeedbackOverview {
  key: string;
  topicId: string;
  topicTitle: string;
  quizId: string;
  quizTitle: string;
  questionId: string;
  questionText: string;
  reports: SyncedQuestionFeedback[];
}

export interface QuestionFeedbackSyncResult {
  projectId: string;
  fetched: number;
  saved: number;
  skipped: number;
  cursor: { reportedAt: string; documentName: string } | null;
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

export interface PublishableQuiz {
  contestId: string;
  quizId: string;
  title: string;
  icon?: string;
  grade: string | null;
  round: string | null;
  year: string | null;
  questionCount: number;
  contentHash: string;
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
}

export interface ContentV2QuizPublishPreview {
  firestore: {
    marketplaceQuizDocument: {
      operation: "upsert";
      path: string;
      data: Record<string, unknown>;
    };
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
export interface ContentV2TopicPublishPreview {
  firestore: {
    topicDocument: {
      operation: "upsert";
      path: string;
      data: Record<string, unknown>;
    };
  };
  firebaseStorage: { uploads: [] };
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
export type DeploymentComponent = "firebase" | "web";
export type DeploymentOperation = "build" | "deploy";
export interface DeploymentItemState {
  id: "firestore-rules" | "firestore-indexes" | "storage-rules" | "functions" | "web";
  localHash: string | null;
  deployedHash: string | null;
  changed: boolean;
}
export interface DeploymentComponentState {
  component: DeploymentComponent;
  status: "build-required" | "not-deployed" | "changed" | "up-to-date";
  builtAt?: string;
  buildVersion?: string;
  deployedAt?: string;
  deployedVersion?: string;
  items: DeploymentItemState[];
}
export interface DeploymentStateSnapshot {
  target: WebDeploymentTarget;
  firebaseProject: string;
  functionsRegion: string;
  firebaseConsoleUrl: string;
  webUrl: string;
  rules: DeploymentComponentState;
  web: DeploymentComponentState;
}
export interface LocalWebRuntimeSnapshot {
  status: "offline" | "starting" | "online" | "error";
  url: string;
  managed: boolean;
  target?: WebDeploymentTarget;
  pid?: number;
  startedAt?: string;
  error?: string;
}
export interface DeploymentJobReportStep {
  id: string;
  label: string;
  status: "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  details: string[];
}
export interface DeploymentJobReport {
  operation: DeploymentOperation;
  component: DeploymentComponent;
  target: WebDeploymentTarget;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  version?: string;
  items: DeploymentItemState[];
  steps: DeploymentJobReportStep[];
}
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
  component?: DeploymentComponent;
  operation?: DeploymentOperation;
  target?: WebDeploymentTarget;
  cancellable: boolean;
  retryable?: boolean;
  error?: string;
  report?: DeploymentJobReport;
}
export interface BackgroundJobsSnapshot {
  aiConcurrency: number;
  jobs: BackgroundJob[];
}
export interface MarketplaceSyncJobItem {
  kind: "topic" | "quiz";
  topicId: string;
  quizId?: string;
}
export interface PaymentPackage {
  id: string; name: { en: string; vi: string }; type: "free" | "monthly" | "annual" | "one-time";
  info: { en: string; vi: string }; benefits: { en: string[]; vi: string[] }; price: { amount: number; currency: string };
}
export interface PaymentSale {
  id: string; name: { en: string; vi: string }; info: { en: string; vi: string };
  recurrence: "one-time" | "yearly"; startsOn: string; endsOn: string; discountPercent: number; packageIds: string[]; enabled: boolean;
}
export interface ImagePdfInput {
  path: string;
  directory: string;
  name: string;
  size: number;
  mimeType: string;
  data: ArrayBuffer;
}

export interface ImagePdfSelection {
  images: ImagePdfInput[];
  defaultDirectory: string | null;
}

export interface ImagePdfOrientation {
  path: string;
  rotation: number;
  rawRotation?: 0 | 90 | 180 | 270;
  sourceOrientation?: 0 | 90 | 180 | 270;
  deskewRotation?: number;
  confidence?: number;
  detected: boolean;
}

export type DynamicQuestionProposal = GetGoDynamicQuestionProposal;
export type DynamicQuestionProposalResult = GetGoDynamicQuestionProposalResult;
export type DynamicQuestionFixResult = GetGoDynamicQuestionFixResult;

export interface SafeWordDictionary {
  schemaVersion: 1;
  words: { en: string[]; vi: string[] };
}

export interface ContentSafetyWarning {
  label: string;
  findings: Array<{ language: "en" | "vi"; term: string; path: string; excerpt: string }>;
}

export interface DesktopApi {
  restartApp(): Promise<void>;
  browseImagePdfInputs(mode: "files" | "folder"): Promise<ImagePdfSelection | null>;
  loadImagePdfInputs(paths: string[]): Promise<ImagePdfSelection>;
  detectImagePdfOrientations(paths: string[]): Promise<ImagePdfOrientation[]>;
  resolveDroppedFilePath(file: File): string;
  saveGeneratedPdf(data: ArrayBuffer, suggestedName: string, defaultDirectory?: string | null): Promise<{ filePath: string } | null>;
  getSettings(): Promise<AppSettings>;
  chooseRepository(): Promise<string | null>;
  loadLegacyOverview(path?: string): Promise<RepositoryViewData>;
  publishMarketplaceTopic(topicId: string, state: import("../../features/topics/domain/content-v2.js").MarketplaceTopicState): Promise<MarketplaceTopicPublishResult>; syncContentV2Marketplace(items: MarketplaceSyncJobItem[]): Promise<BackgroundJobsSnapshot>;
  listPaymentPackages(): Promise<PaymentPackage[]>;
  savePaymentPackages(items: PaymentPackage[]): Promise<PaymentPackage[]>;
  syncPaymentPackages(): Promise<{ count: number; syncedAt: string }>;
  listPaymentSales(): Promise<PaymentSale[]>;
  savePaymentSales(items: PaymentSale[]): Promise<PaymentSale[]>;
  syncPaymentSales(): Promise<{ count: number; syncedAt: string }>;
  loadSafeWordDictionary(): Promise<SafeWordDictionary>;
  saveSafeWordDictionary(dictionary: SafeWordDictionary): Promise<SafeWordDictionary>;
  onContentSafetyWarning(listener: (warning: ContentSafetyWarning) => void): () => void;
  loadContentV2Topic(topicId: string): Promise<ContentV2Topic>;
  loadContentV2Route(topicId?: string): Promise<ContentV2RouteData>;
  loadContentV2Quiz(topicId: string, quizId: string): Promise<ContentV2Quiz>;
  loadContentV2Question(
    topicId: string,
    quizId: string,
    questionId: string,
  ): Promise<ContentV2Question>;
  syncQuestionFeedback(): Promise<QuestionFeedbackSyncResult>;
  listAllQuestionFeedback(): Promise<SyncedQuestionFeedback[]>;
  listQuestionFeedbackOverview(): Promise<QuestionFeedbackOverview[]>;
  loadQuestionFeedback(topicId: string, quizId: string, questionId: string): Promise<SyncedQuestionFeedback[]>;
  updateQuestionFeedbackReview(topicId: string, quizId: string, feedbackId: string, status: SyncedQuestionFeedbackStatus, note?: string): Promise<SyncedQuestionFeedback>;
  loadContentV2QuizResources(
    topicId: string,
    quizId: string,
  ): Promise<Record<string, unknown>>;
  saveContentV2QuizDictionary(
    topicId: string,
    quizId: string,
    dictionary: AlphabetDictionary,
  ): Promise<AlphabetDictionary>;
  loadContentV2TopicDictionary(topicId: string): Promise<KidLearningDictionary>;
  saveContentV2TopicDictionary(
    topicId: string,
    dictionary: KidLearningDictionary,
  ): Promise<KidLearningDictionary>;
  listContentV2TopicAssets(topicId: string): Promise<ContentV2TopicAssetSummary[]>;
  readContentV2TopicAsset(topicId: string, filename: string): Promise<string>;
  importContentV2TopicAssets(topicId: string): Promise<ContentV2TopicAssetSummary[]>;
  trashContentV2TopicAsset(topicId: string, filename: string): Promise<ContentV2TopicAssetSummary[]>;
  showContentV2TopicAssetsFolder(topicId: string): Promise<void>; saveContentV2Topic(topic: ContentV2Topic): Promise<ContentV2Topic>;
  setContentV2MarketplaceState(target: "topics" | "quizzes", ids: string[], state: import("../../features/topics/domain/content-v2.js").MarketplaceTopicState, topicId?: string): Promise<MarketplaceStateUpdateResult>;
  saveContentV2Quiz(
    topicId: string,
    quiz: ContentV2Quiz,
  ): Promise<ContentV2Quiz>;
  saveContentV2Question(
    topicId: string,
    quizId: string,
    question: ContentV2Question,
  ): Promise<ContentV2Question>;
  deleteContentV2Topic(topicId: string): Promise<{ id: string }>;
  deleteContentV2Quiz(
    topicId: string,
    quizId: string,
  ): Promise<{ topicId: string; id: string }>;
  deleteContentV2Question(
    topicId: string,
    quizId: string,
    questionId: string,
  ): Promise<{ topicId: string; quizId: string; id: string }>;
  setEnvironment(environment: AppSettings["environment"]): Promise<AppSettings>;
  setAiProfile(profile: AppSettings["aiProfile"]): Promise<AppSettings>;
  setLocale(locale: AppSettings["locale"]): Promise<AppSettings>;
  setSpeechSettings(
    language: SpeechLanguage,
    settings: SpeechLanguageSettings,
  ): Promise<AppSettings>;
  checkEnvironmentReadiness(): Promise<EnvironmentReadiness>;
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
  previewContentV2TopicPublish(topicId: string): Promise<ContentV2TopicPublishPreview>;
  showInFolder(path: string): Promise<void>;
  showQuizQuestionInFolder(
    manifestPath: string,
    questionNo: number | string,
  ): Promise<void>;
  openQuizSourcePdf(manifestPath: string): Promise<void>;
  readQuizAsset(manifestPath: string, assetReference: string): Promise<string>;
  saveQuizAsset(manifestPath: string, suggestedName: string, dataUrl: string): Promise<{ reference: string; preview: string }>;
  readQuizSource(manifestPath: string): Promise<string>;
  saveQuizSource(manifestPath: string, source: string): Promise<void>;
  loadQuizQuestions(manifestPath: string): Promise<QuizQuestionRecord[]>;
  loadAlphabetDictionary(manifestPath: string): Promise<AlphabetDictionary>;
  saveAlphabetDictionary(
    manifestPath: string,
    dictionary: AlphabetDictionary,
  ): Promise<AlphabetDictionary>;
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
  ): Promise<{ topicId: string; quizId: string; reviewed: number }>;
  createQuizQuestion(
    manifestPath: string,
  ): Promise<{ question: QuizQuestionRecord; snapshot: RepositoryViewData }>;
  reorderQuizQuestions(
    manifestPath: string,
    questionNumbers: string[],
  ): Promise<{ questions: QuizQuestionRecord[]; snapshot: RepositoryViewData }>;
  deleteQuizQuestion(
    manifestPath: string,
    questionNo: string,
  ): Promise<{ questions: QuizQuestionRecord[]; snapshot: RepositoryViewData }>;
  resetQuizQuestion(
    manifestPath: string,
    question: QuizQuestionRecord,
  ): Promise<QuizQuestionRecord>;
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  resolveYouTubeResources(
    urls: string[],
  ): Promise<Array<{ url: string; title?: string; durationSeconds?: number; error?: string }>>;
  createContest(settings: ContestSettings): Promise<RepositoryViewData>;
  updateContest(
    id: string,
    settings: ContestSettings,
  ): Promise<RepositoryViewData>;
  renameContest(currentId: string, nextId: string): Promise<RepositoryViewData>;
  deleteContest(id: string): Promise<RepositoryViewData>;
  createQuiz(
    contest: string,
    input: QuizCrudInput,
  ): Promise<RepositoryViewData>;
  updateQuiz(
    manifestPath: string,
    input: Omit<QuizCrudInput, "id">,
  ): Promise<RepositoryViewData>;
  deleteQuiz(manifestPath: string): Promise<RepositoryViewData>;
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
    operation: DeploymentOperation,
    component: DeploymentComponent,
    target: WebDeploymentTarget,
  ): Promise<BackgroundJobsSnapshot>;
  getDeploymentState(target: WebDeploymentTarget): Promise<DeploymentStateSnapshot>;
  getLocalWebRuntime(): Promise<LocalWebRuntimeSnapshot>;
  startLocalWebRuntime(): Promise<LocalWebRuntimeSnapshot>;
  restartLocalWebRuntime(): Promise<LocalWebRuntimeSnapshot>;
  cancelBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  pauseBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  resumeBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  retryBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
  deleteBackgroundJob(jobId: string): Promise<BackgroundJobsSnapshot>;
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
} from "../../features/topics/domain/content-v2.js";
