export const contentStatuses = [
  "imported", "normalized", "generated", "reviewed", "validated", "published",
] as const

export type ContentStatus = (typeof contentStatuses)[number]
export type DeploymentStatus = "not-built" | "not-uploaded" | "uploaded" | "outdated" | "unknown"
export type QuestionStorageVersion = "legacy" | "questions-v1"

export interface QuizManifest {
  schemaVersion: number
  id: string
  legacyId: string
  contest: string
  title?: string
  grade?: string | null
  round?: string | null
  year?: string | null
  status: ContentStatus
  source: { format: string; rawJsonSha256: string; quizTsSha256: string }
  quizBuilderApiVersion?: number
  questionStorageVersion?: "questions-v1"
  publishedHash?: string
  publishedAt?: string
}

export interface QuizSummary {
  key: string
  relativePath: string
  manifestPath: string
  id: string
  legacyId: string
  contest: string
  title: string
  grade: string | null
  round: string | null
  year: string | null
  contentStatus: ContentStatus
  deploymentStatus: DeploymentStatus
  hasSourcePdf: boolean
  hasRawJson: boolean
  hasQuizTs: boolean
  questionStorageVersion: QuestionStorageVersion
  hasGeneratedArtifact: boolean
  artifactHash: string | null
  publishedHash: string | null
  publishedAt: string | null
  /** Hash of the cached, sanitized runtime questions. Calculated on the initial
   * repository scan and maintained incrementally by Tools mutations. */
  localContentHash: string | null
  questionCount: number | null
  reviewedQuestionCount: number
  migrationErrorCount: number
  aiMigrationJob?: QuizAiMigrationJob | null
  quizBuilderApiVersion: number | null
  modifiedAt: string
}

export interface ScanIssue {
  path: string
  message: string
}

export interface RepositorySnapshot {
  repositoryPath: string
  scannedAt: string
  contests: ContestSummary[]
  quizzes: QuizSummary[]
  issues: ScanIssue[]
}

export interface QuizMigrationResult {
  snapshot: RepositorySnapshot
  migratedQuizIds: string[]
  failures: Array<{ quizId: string; message: string }>
}

export interface ContestSettings {
  $schema?: string
  $comment?: string
  book: {
    code: string
    title: string
    description?: string
    subject: number
    isActive?: boolean
  }
  rounds: Array<Record<string, unknown>>
  grades: Array<Record<string, unknown>>
  categories?: Array<Record<string, unknown>>
  quizRules?: Array<Record<string, unknown>>
}

export interface ContestSummary {
  id: string
  title: string
  description: string
  subject: number
  isActive: boolean
  settingsPath: string
  settings: ContestSettings
}

export interface QuizCrudInput {
  id: string
  title: string
  grade: string | null
  round: string | null
  year: string | null
  status?: ContentStatus
  quizBuilderApiVersion?: number
}

export interface QuizQuestionRecord extends Record<string, unknown> {
  question_no: number | string
  category?: string
  text_en?: unknown
  text_vn?: unknown
  action?: "generated"
  status?: string
  /** @deprecated Legacy compatibility only. Use status. */
  verified?: boolean
  feedback?: QuestionFeedback
  migrationError?: { stage: "origin-render"; message: string }
  authoringMode?: string
  advancedDynamic?: {
    paramsGeneratorTs: string
    questionGeneratorTs: string
    originParamsTs: string
    explanationGeneratorTs: string
    [key: string]: unknown
  }
  aiResponse?: DynamicQuestionProposalResult & { generatedAt: string; processingTimeMs?: number }
  aiFixHistory?: Array<DynamicQuestionFixResult & { generatedAt: string; processingTimeMs?: number; proposal: DynamicQuestionProposal }>
}

export type QuestionIssue = "missing-image" | "wrong-question" | "wrong-answer"
export interface QuestionFeedback {
  issues: QuestionIssue[]
  note?: string
  updatedAt: string
}

export const supportedQuizBuilderApiVersions = [1] as const

export interface AppSettings {
  repositoryPath: string | null
  environment: "development" | "staging" | "production"
  aiProfile: "thorough" | "fast"
  locale: "en" | "vi"
}

export interface AuthUser {
  uid: string
  email: string
  displayName: string | null
  emailVerified: boolean
}

export interface AuthState {
  user: AuthUser | null
}

export interface EnvironmentReadinessCheck {
  id: "configuration" | "authentication"
  ready: boolean
  message: string
}

export interface EnvironmentReadiness {
  environment: AppSettings["environment"]
  projectId: string | null
  ready: boolean
  checks: EnvironmentReadinessCheck[]
}

export type PublishingStatus = "not-published" | "up-to-date" | "changed" | "local-error" | "remote-error"

export interface PublishableQuiz {
  contestId: string
  quizId: string
  title: string
  grade: string | null
  round: string | null
  year: string | null
  questionCount: number
  contentHash: string
}

export interface PublishingQuizStatus {
  contestId: string
  quizId: string
  title: string
  grade: string | null
  round: string | null
  year: string | null
  questionCount: number | null
  contentHash: string | null
  publishedHash: string | null
  publishedAt: string | null
  status: PublishingStatus
  error?: string
}

export interface PublishingSnapshot {
  environment: AppSettings["environment"]
  projectId: string
  scannedAt: string
  quizzes: PublishingQuizStatus[]
}

export interface PublishResult {
  contestId: string
  quizId: string
  contentHash: string
  questionCount: number
  publishedAt: string
}

export type AiMigrationJobStatus = "queued" | "running" | "completed" | "cancelled" | "failed"
export interface AiMigrationJob {
  id: string
  contestId: string
  quizId: string
  quizTitle: string
  manifestPath: string
  context: Record<string, unknown>
  status: AiMigrationJobStatus
  total: number
  processed: number
  succeeded: number
  failed: number
  skippedImages: number
  skippedVerified: number
  currentQuestion?: string
  errors: Array<{ questionNo: string; message: string }>
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export type QuizAiMigrationJob = Omit<AiMigrationJob, "manifestPath" | "context">

export interface AiMigrationJobsSnapshot {
  concurrency: number
  jobs: AiMigrationJob[]
}

export type DynamicQuestionProposal = GetGoDynamicQuestionProposal
export type DynamicQuestionProposalResult = GetGoDynamicQuestionProposalResult
export type DynamicQuestionFixResult = GetGoDynamicQuestionFixResult

export interface DesktopApi {
  restartApp(): Promise<void>
  getSettings(): Promise<AppSettings>
  chooseRepository(): Promise<RepositorySnapshot | null>
  scanRepository(path?: string): Promise<RepositorySnapshot>
  setEnvironment(environment: AppSettings["environment"]): Promise<AppSettings>
  setAiProfile(profile: AppSettings["aiProfile"]): Promise<AppSettings>
  setLocale(locale: AppSettings["locale"]): Promise<AppSettings>
  checkEnvironmentReadiness(): Promise<EnvironmentReadiness>
  getPublishingStatus(): Promise<PublishingSnapshot>
  publishQuiz(contestId: string, quizId: string): Promise<PublishResult>
  showInFolder(path: string): Promise<void>
  showQuizQuestionInFolder(manifestPath: string, questionNo: number | string): Promise<void>
  readQuizAsset(manifestPath: string, assetReference: string): Promise<string>
  readQuizSource(manifestPath: string): Promise<string>
  saveQuizSource(manifestPath: string, source: string): Promise<void>
  loadQuizQuestions(manifestPath: string): Promise<QuizQuestionRecord[]>
  migrateLegacyQuizzes(contestId: string): Promise<QuizMigrationResult>
  saveQuizQuestion(manifestPath: string, question: QuizQuestionRecord): Promise<QuizQuestionRecord>
  createQuizQuestion(manifestPath: string): Promise<{ question: QuizQuestionRecord; snapshot: RepositorySnapshot }>
  reorderQuizQuestions(manifestPath: string, questionNumbers: string[]): Promise<{ questions: QuizQuestionRecord[]; snapshot: RepositorySnapshot }>
  deleteQuizQuestion(manifestPath: string, questionNo: string): Promise<{ questions: QuizQuestionRecord[]; snapshot: RepositorySnapshot }>
  resetQuizQuestion(manifestPath: string, question: QuizQuestionRecord): Promise<QuizQuestionRecord>
  openExternal(url: string): Promise<void>
  copyText(text: string): Promise<void>
  createContest(settings: ContestSettings): Promise<RepositorySnapshot>
  updateContest(id: string, settings: ContestSettings): Promise<RepositorySnapshot>
  renameContest(currentId: string, nextId: string): Promise<RepositorySnapshot>
  deleteContest(id: string): Promise<RepositorySnapshot>
  createQuiz(contest: string, input: QuizCrudInput): Promise<RepositorySnapshot>
  updateQuiz(manifestPath: string, input: Omit<QuizCrudInput, "id">): Promise<RepositorySnapshot>
  deleteQuiz(manifestPath: string): Promise<RepositorySnapshot>
  getAuthState(): Promise<AuthState>
  signIn(email: string, password: string): Promise<AuthState>
  signInWithProvider(provider: "google" | "facebook" | "apple"): Promise<AuthState>
  signOut(): Promise<AuthState>
  changePassword(password: string): Promise<void>
  createDynamicQuestionProposal(input: { question: QuizQuestionRecord; context?: Record<string, unknown>; instructions?: string }): Promise<DynamicQuestionProposalResult>
  fixDynamicQuestion(input: { originalQuestion: QuizQuestionRecord; currentCode: NonNullable<QuizQuestionRecord["advancedDynamic"]>; currentSummary: GetGoDynamicQuestionSummary; context?: Record<string, unknown>; diagnostics?: string[]; instructions: string }): Promise<DynamicQuestionFixResult>
  cancelDynamicQuestionAi(): Promise<void>
  startAiMigrationJob(input: { manifestPath: string; context: Record<string, unknown> }): Promise<AiMigrationJob>
  getAiMigrationJobs(): Promise<AiMigrationJobsSnapshot>
  setAiMigrationConcurrency(concurrency: number): Promise<AiMigrationJobsSnapshot>
  cancelAiMigrationJob(jobId: string): Promise<AiMigrationJobsSnapshot>
}
import type {
  GetGoDynamicQuestionProposal,
  GetGoDynamicQuestionProposalResult,
  GetGoDynamicQuestionFixResult,
  GetGoDynamicQuestionSummary,
} from "@tnp/getgo-logics/authoring"
