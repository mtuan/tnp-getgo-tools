export const contentStatuses = [
  "imported", "normalized", "generated", "reviewed", "validated", "published",
] as const

export type ContentStatus = (typeof contentStatuses)[number]
export type DeploymentStatus = "not-built" | "not-uploaded" | "uploaded" | "outdated" | "unknown"

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
  hasGeneratedArtifact: boolean
  artifactHash: string | null
  questionCount: number | null
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
  verified?: boolean
  authoringMode?: string
  advancedDynamic?: {
    paramsGeneratorTs: string
    questionGeneratorTs: string
    originParamsTs: string
    explanationGeneratorTs: string
    [key: string]: unknown
  }
}

export const supportedQuizBuilderApiVersions = [1] as const

export interface AppSettings {
  repositoryPath: string | null
  environment: "development" | "staging" | "production"
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

export interface DynamicQuestionProposal {
  paramsGeneratorTs: string
  questionGeneratorTs: string
  originParamsTs: string
  explanationGeneratorTs: string
  explanation: string
  assumptions: string[]
  warnings: string[]
  confidence: number
  [key: string]: unknown
}

export interface DynamicQuestionProposalResult {
  proposal: DynamicQuestionProposal
  model?: string
  usage?: Record<string, unknown>
}

export interface DesktopApi {
  getSettings(): Promise<AppSettings>
  chooseRepository(): Promise<RepositorySnapshot | null>
  scanRepository(path?: string): Promise<RepositorySnapshot>
  setEnvironment(environment: AppSettings["environment"]): Promise<AppSettings>
  showInFolder(path: string): Promise<void>
  readQuizSource(manifestPath: string): Promise<string>
  saveQuizSource(manifestPath: string, source: string): Promise<void>
  loadQuizQuestions(manifestPath: string): Promise<QuizQuestionRecord[]>
  saveQuizQuestion(manifestPath: string, question: QuizQuestionRecord): Promise<QuizQuestionRecord>
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
  createDynamicQuestionProposal(input: { contestId: string; quizId: string; questionId: string; instructions?: string }): Promise<DynamicQuestionProposalResult>
}
