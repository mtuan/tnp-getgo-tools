import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"
import type { ContestSettings, QuizCrudInput, QuizManifest } from "../core/models.js"
import { contestSettingsSchema, quizManifestSchema } from "../core/schema.js"
import { createQuizQuestion } from "./quiz-questions.js"

const safeIdPattern = /^[a-z0-9][a-z0-9_-]*$/

export function validateRepositoryId(value: string, label: string): string {
  const normalized = value.trim().toLowerCase()
  if (!safeIdPattern.test(normalized)) throw new Error(`${label} must use lowercase letters, numbers, hyphens, or underscores.`)
  return normalized
}

async function pathExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true } catch { return false }
}

export async function createContestDirectory(root: string, requestedSettings: ContestSettings): Promise<void> {
  const settings = contestSettingsSchema.parse(requestedSettings)
  const id = validateRepositoryId(settings.book.code, "Contest ID")
  const directory = path.join(root, "quizzes", id)
  if (await pathExists(directory)) throw new Error(`Contest “${id}” already exists.`)
  await fs.mkdir(directory, { recursive: false })
  try {
    await fs.writeFile(path.join(directory, "settings.json"), JSON.stringify({ ...settings, $schema: "../settings.schema.json" }, null, 2) + "\n", "utf8")
  } catch (cause) {
    await fs.rm(directory, { recursive: true, force: true })
    throw cause
  }
}

export async function updateContestSettings(root: string, requestedId: string, requestedSettings: ContestSettings): Promise<void> {
  const id = validateRepositoryId(requestedId, "Contest ID")
  const settings = contestSettingsSchema.parse(requestedSettings)
  if (settings.book.code !== id) throw new Error("Contest code cannot be changed after creation.")
  const settingsPath = path.join(root, "quizzes", id, "settings.json")
  await fs.access(settingsPath)
  await fs.writeFile(settingsPath, JSON.stringify({ ...settings, $schema: "../settings.schema.json" }, null, 2) + "\n", "utf8")
}

export async function renameContestDirectory(root: string, currentId: string, requestedId: string): Promise<void> {
  const current = validateRepositoryId(currentId, "Contest ID")
  const next = validateRepositoryId(requestedId, "Contest ID")
  if (current === next) return
  const currentDirectory = path.join(root, "quizzes", current)
  const nextDirectory = path.join(root, "quizzes", next)
  if (!(await pathExists(currentDirectory))) throw new Error(`Contest “${current}” does not exist.`)
  if (await pathExists(nextDirectory)) throw new Error(`Contest “${next}” already exists.`)
  await fs.rename(currentDirectory, nextDirectory)
  const settingsPath = path.join(nextDirectory, "settings.json")
  const settings = contestSettingsSchema.parse(JSON.parse(await fs.readFile(settingsPath, "utf8")))
  await fs.writeFile(settingsPath, JSON.stringify({ ...settings, book: { ...settings.book, code: next } }, null, 2) + "\n", "utf8")
  const entries = await fs.readdir(nextDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(nextDirectory, entry.name, "manifest.json")
    if (!(await pathExists(manifestPath))) continue
    const manifest = quizManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")))
    await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, contest: next }, null, 2) + "\n", "utf8")
  }
}

export async function createQuizFiles(root: string, contestId: string, input: QuizCrudInput): Promise<void> {
  const contest = validateRepositoryId(contestId, "Contest ID")
  const id = validateRepositoryId(input.id, "Quiz ID")
  const contestDirectory = path.join(root, "quizzes", contest)
  if (!(await pathExists(contestDirectory))) throw new Error(`Contest “${contest}” does not exist.`)
  const directory = path.join(contestDirectory, id)
  if (await pathExists(directory)) throw new Error(`Quiz “${id}” already exists.`)
  const title = input.title.trim() || id
  const quizSource = `import QB from '@src/utils/quiz-builder';\n\nexport default {\n  exam_no: ${JSON.stringify(id)},\n  title: ${JSON.stringify(title)},\n  grade: ${JSON.stringify(input.grade ?? "")},\n  round: ${JSON.stringify(input.round ?? "")},\n  year: ${JSON.stringify(input.year ?? "")},\n  questions: [\n    QB.template(\n      () => ({}),\n      () => ({\n        question_no: 1,\n        category: "",\n        text_en: "",\n        answer: { type: "input", correct: "" },\n      }),\n    ),\n  ],\n};\n`
  const manifest: QuizManifest = {
    schemaVersion: 1,
    questionStorageVersion: "questions-v1",
    id,
    legacyId: id,
    contest,
    title,
    type: input.type ?? "question-list",
    grade: input.grade,
    round: input.round,
    year: input.year,
    status: input.status ?? "imported",
    source: {
      format: "manual-v1",
      rawJsonSha256: "",
      quizTsSha256: createHash("sha256").update(quizSource).digest("hex"),
    },
    quizBuilderApiVersion: input.quizBuilderApiVersion ?? 1,
  }
  await fs.mkdir(directory)
  try {
    const manifestPath = path.join(directory, "manifest.json")
    await Promise.all([
      fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"),
      fs.writeFile(path.join(directory, "quiz.ts"), quizSource, "utf8"),
    ])
    await createQuizQuestion(manifestPath)
  } catch (cause) {
    await fs.rm(directory, { recursive: true, force: true })
    throw cause
  }
}

export async function updateQuizManifest(manifestPath: string, input: Omit<QuizCrudInput, "id">): Promise<void> {
  const manifest = quizManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")))
  const quizSourcePath = path.join(path.dirname(manifestPath), "quiz.ts")
  let quizSource = await fs.readFile(quizSourcePath, "utf8")
  const fields = { title: input.title.trim() || manifest.title || manifest.id, grade: input.grade ?? "", round: input.round ?? "", year: input.year ?? "" }
  for (const [field, value] of Object.entries(fields)) {
    const pattern = new RegExp(`^(\\s*${field}\\s*:\\s*).*(,\\s*)$`, "m")
    quizSource = quizSource.replace(pattern, (_match, prefix: string, suffix: string) => `${prefix}${JSON.stringify(value)}${suffix}`)
  }
  const updated: QuizManifest = {
    ...manifest,
    title: fields.title,
    type: input.type ?? manifest.type ?? "question-list",
    grade: input.grade,
    round: input.round,
    year: input.year,
    status: input.status ?? manifest.status,
    quizBuilderApiVersion: input.quizBuilderApiVersion ?? manifest.quizBuilderApiVersion,
  }
  updated.source.quizTsSha256 = createHash("sha256").update(quizSource).digest("hex")
  await Promise.all([
    fs.writeFile(manifestPath, JSON.stringify(updated, null, 2) + "\n", "utf8"),
    fs.writeFile(quizSourcePath, quizSource, "utf8"),
  ])
}

export async function updateQuizSource(manifestPath: string, source: string): Promise<void> {
  const manifest = quizManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, "utf8")))
  manifest.source.quizTsSha256 = createHash("sha256").update(source).digest("hex")
  await Promise.all([
    fs.writeFile(path.join(path.dirname(manifestPath), "quiz.ts"), source, "utf8"),
    fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8"),
  ])
}
