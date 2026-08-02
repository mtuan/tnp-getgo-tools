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
  quizzes: QuizSummary[]
  issues: ScanIssue[]
}

export interface AppSettings {
  repositoryPath: string | null
  environment: "development" | "staging" | "production"
}

export interface DesktopApi {
  getSettings(): Promise<AppSettings>
  chooseRepository(): Promise<RepositorySnapshot | null>
  scanRepository(path?: string): Promise<RepositorySnapshot>
  setEnvironment(environment: AppSettings["environment"]): Promise<AppSettings>
  showInFolder(path: string): Promise<void>
  readQuizSource(manifestPath: string): Promise<string>
  saveQuizSource(manifestPath: string, source: string): Promise<void>
  openExternal(url: string): Promise<void>
}
