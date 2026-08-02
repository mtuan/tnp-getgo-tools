import { promises as fs } from "node:fs"
import path from "node:path"

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

const inlineImagePattern = /^data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i

function sourceLiteral(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, "$1$2:")
}

function indent(source: string, spaces: number): string {
  const prefix = " ".repeat(spaces)
  return source.split("\n").map(line => `${prefix}${line}`).join("\n")
}

function answerExpression(value: unknown): string {
  const answer = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const choices = answer.choices && typeof answer.choices === "object" ? answer.choices as Record<string, unknown> : null
  if (choices && Object.keys(choices).length) return `QB.answer.choice(${sourceLiteral(answer.correct)}, ${sourceLiteral(choices)})`
  return `QB.answer.input(${sourceLiteral(answer.correct ?? "")}${answer.unit ? `, ${sourceLiteral(answer.unit)}` : ""})`
}

function questionGeneratorSource(question: Record<string, unknown>): string {
  const fields = Object.fromEntries(Object.entries(question).filter(([key]) => !["answer", "verified", "schemaVersion", "authoringMode", "advancedDynamic", "generatorBuild"].includes(key)))
  const fieldSource = sourceLiteral(fields).slice(1, -1).trim()
  return `({}) => {\n  return {\n${fieldSource ? `${indent(fieldSource, 4)},\n` : ""}    answer: ${answerExpression(question.answer)},\n  }\n}`
}

function imageExtension(subtype: string): string {
  if (subtype.toLowerCase() === "jpeg") return "jpg"
  if (subtype.toLowerCase() === "svg+xml") return "svg"
  return subtype.toLowerCase().replace(/[^a-z0-9]/g, "") || "png"
}

async function extractImages(question: Record<string, unknown>, index: number, assetsDirectory: string): Promise<Record<string, unknown>> {
  const questionNo = String(question.question_no ?? index + 1).replace(/[^a-z0-9_-]/gi, "-")
  const stem = `question-${questionNo}`
  const processValue = async (value: unknown, name: string): Promise<unknown> => {
    if (typeof value !== "string") return value
    const match = value.match(inlineImagePattern)
    if (!match) return value
    const fileName = `${name}.${imageExtension(match[1])}`
    await fs.mkdir(assetsDirectory, { recursive: true })
    await fs.writeFile(path.join(assetsDirectory, fileName), Buffer.from(match[2].replace(/\s/g, ""), "base64"))
    return `asset:${fileName}`
  }
  const imageDatas = Array.isArray(question.image_datas)
    ? await Promise.all(question.image_datas.map((value, imageIndex) => processValue(value, imageIndex ? `${stem}-${imageIndex + 1}` : stem)))
    : question.image_datas
  const answer = question.answer && typeof question.answer === "object" ? question.answer as Record<string, unknown> : undefined
  const choices = answer?.choices && typeof answer.choices === "object" ? answer.choices as Record<string, unknown> : undefined
  const nextChoices = choices ? Object.fromEntries(await Promise.all(Object.entries(choices).map(async ([label, value]) => [label, await processValue(value, `${stem}-${label}`)]))) : undefined
  return { ...question, ...(imageDatas !== undefined ? { image_datas: imageDatas } : {}), ...(answer ? { answer: { ...answer, ...(nextChoices ? { choices: nextChoices } : {}) } } : {}) }
}

function normalizeQuestion(question: Record<string, unknown>, index: number): QuizQuestionRecord {
  const normalized: Record<string, unknown> & { question_no: number | string } = { ...question, question_no: (question.question_no as number | string | undefined) ?? index + 1 }
  if (normalized.authoringMode === "advanced-dynamic" && normalized.advancedDynamic) return normalized as QuizQuestionRecord
  return {
    ...normalized,
    schemaVersion: Number(normalized.schemaVersion) || 1,
    verified: normalized.verified === true,
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => {\n  return {}\n}",
      questionGeneratorTs: questionGeneratorSource(normalized),
      originParamsTs: "{}",
      explanationGeneratorTs: "({}) => {\n  return { en: \"\", vi: \"\" }\n}",
    },
  }
}

function questionNumber(fileName: string): number {
  return Number(fileName.match(/^q(\d+)\.json$/i)?.[1] ?? Number.MAX_SAFE_INTEGER)
}

export async function loadQuizQuestions(manifestPath: string): Promise<QuizQuestionRecord[]> {
  const quizDirectory = path.dirname(manifestPath)
  const questionsDirectory = path.join(quizDirectory, "questions")
  const existing = await fs.readdir(questionsDirectory).catch(() => [] as string[])
  const files = existing.filter(name => /^q\d+\.json$/i.test(name)).sort((a, b) => questionNumber(a) - questionNumber(b))
  if (files.length) return Promise.all(files.map(async file => JSON.parse(await fs.readFile(path.join(questionsDirectory, file), "utf8")) as QuizQuestionRecord))

  const raw = JSON.parse(await fs.readFile(path.join(quizDirectory, "raw.json"), "utf8")) as Record<string, unknown> | unknown[]
  const rawQuestions = Array.isArray(raw) ? raw : Array.isArray(raw.questions) ? raw.questions : []
  await fs.mkdir(questionsDirectory, { recursive: true })
  const records: QuizQuestionRecord[] = []
  for (let index = 0; index < rawQuestions.length; index += 1) {
    const value = rawQuestions[index]
    if (!value || typeof value !== "object") continue
    const withAssets = await extractImages(value as Record<string, unknown>, index, path.join(quizDirectory, "assets"))
    const record = normalizeQuestion(withAssets, index)
    await fs.writeFile(path.join(questionsDirectory, `q${record.question_no}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8")
    records.push(record)
  }
  return records
}

export async function saveQuizQuestion(manifestPath: string, question: QuizQuestionRecord): Promise<void> {
  const questionNo = String(question.question_no)
  if (!/^\d+$/.test(questionNo)) throw new Error("Invalid question number")
  const questionsDirectory = path.join(path.dirname(manifestPath), "questions")
  await fs.mkdir(questionsDirectory, { recursive: true })
  await fs.writeFile(path.join(questionsDirectory, `q${questionNo}.json`), `${JSON.stringify(question, null, 2)}\n`, "utf8")
}
