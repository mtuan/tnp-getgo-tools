import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { QuizManifest, QuizSummary, RepositorySnapshot, ScanIssue } from "../core/models.js"
import { quizManifestSchema } from "../core/schema.js"
import { deriveDeploymentStatus } from "../core/status.js"

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true } catch { return false }
}

async function findManifests(root: string): Promise<string[]> {
  const quizzesRoot = path.join(root, "quizzes")
  const found: string[] = []
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    await Promise.all(entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(entryPath)
      else if (entry.name === "manifest.json") found.push(entryPath)
    }))
  }
  await walk(quizzesRoot)
  return found.sort()
}

function getArtifactHash(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  for (const key of ["artifactHash", "quizJsSha256", "sha256", "hash"]) {
    if (typeof record[key] === "string") return record[key]
  }
  for (const nested of ["artifact", "build", "files"]) {
    const result = getArtifactHash(record[nested])
    if (result) return result
  }
  return null
}

function getQuestionCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  for (const key of ["questionCount", "questionsCount"]) {
    if (typeof record[key] === "number") return record[key]
  }
  return null
}

async function readGenerated(root: string, manifest: QuizManifest): Promise<{
  exists: boolean; hash: string | null; questionCount: number | null
}> {
  const directory = path.join(root, "generated", "quizzes", manifest.contest, manifest.id)
  const manifestPath = path.join(directory, "manifest.json")
  const quizJsPath = path.join(directory, "quiz.js")
  if (!(await exists(manifestPath)) || !(await exists(quizJsPath))) {
    return { exists: false, hash: null, questionCount: null }
  }
  try {
    const generated = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
    const explicitHash = getArtifactHash(generated)
    const hash = explicitHash ?? createHash("sha256").update(await fs.readFile(quizJsPath)).digest("hex")
    return { exists: true, hash, questionCount: getQuestionCount(generated) }
  } catch {
    return { exists: true, hash: null, questionCount: null }
  }
}

async function mapQuiz(root: string, manifestPath: string): Promise<QuizSummary> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown
  const manifest = quizManifestSchema.parse(raw)
  const directory = path.dirname(manifestPath)
  const generated = await readGenerated(root, manifest)
  const stat = await fs.stat(manifestPath)
  const relativePath = path.relative(root, directory)
  return {
    key: `${manifest.contest}/${manifest.id}`,
    relativePath,
    manifestPath,
    id: manifest.id,
    legacyId: manifest.legacyId,
    contest: manifest.contest,
    grade: manifest.grade ?? null,
    round: manifest.round ?? null,
    year: manifest.year ?? null,
    contentStatus: manifest.status,
    deploymentStatus: deriveDeploymentStatus({
      contentStatus: manifest.status,
      hasGeneratedArtifact: generated.exists,
      localArtifactHash: generated.hash,
    }),
    hasSourcePdf: await exists(path.join(directory, "source.pdf")),
    hasRawJson: await exists(path.join(directory, "raw.json")),
    hasQuizTs: await exists(path.join(directory, "quiz.ts")),
    hasGeneratedArtifact: generated.exists,
    artifactHash: generated.hash,
    questionCount: generated.questionCount,
    quizBuilderApiVersion: manifest.quizBuilderApiVersion ?? null,
    modifiedAt: stat.mtime.toISOString(),
  }
}

export async function scanQuizRepository(repositoryPath: string): Promise<RepositorySnapshot> {
  const root = path.resolve(repositoryPath)
  if (!(await exists(path.join(root, "quizzes")))) {
    throw new Error("This folder does not contain a quizzes directory.")
  }
  const manifests = await findManifests(root)
  const quizzes: QuizSummary[] = []
  const issues: ScanIssue[] = []
  for (const manifestPath of manifests) {
    try { quizzes.push(await mapQuiz(root, manifestPath)) }
    catch (error) {
      issues.push({
        path: path.relative(root, manifestPath),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { repositoryPath: root, scannedAt: new Date().toISOString(), quizzes, issues }
}
