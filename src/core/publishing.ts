import { createHash } from "node:crypto"
import type { QuizQuestionRecord } from "./models.js"

export interface PublishedQuestion {
  question_no: number
  category?: string
  text_en: string | string[]
  text_vn?: string | string[]
  image_datas?: string[]
  explanation?: { en: string; vi?: string }
  answer: {
    type: string
    correct: string | number | string[]
    choices?: Record<string, string | number | Record<string, unknown>>
    unit?: string
    otherChoiceKey?: string
    fixed?: boolean
  }
  dynamic?: {
    paramsGeneratorTs: string
    questionGeneratorTs: string
    originParamsTs: string
    explanationGeneratorTs: string
  }
}

function text(value: unknown, field: string, required = false): string | string[] | undefined {
  if (typeof value === "string") return value
  if (Array.isArray(value) && value.every(item => typeof item === "string")) return [...value]
  if (!required && value === undefined) return undefined
  throw new Error(`${field} must be text or an array of text.`)
}

function plainRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`)
  return value as Record<string, unknown>
}

export function sanitizePublishedQuestion(record: QuizQuestionRecord): PublishedQuestion {
  const questionNo = Number(record.question_no)
  if (!Number.isInteger(questionNo) || questionNo < 1) throw new Error("question_no must be a positive integer.")
  const answer = plainRecord(record.answer, `Question ${questionNo} answer`)
  if (typeof answer.type !== "string" || !answer.type) throw new Error(`Question ${questionNo} answer.type is required.`)
  const correct = answer.correct
  if (!(typeof correct === "string" || typeof correct === "number" || (Array.isArray(correct) && correct.every(item => typeof item === "string")))) {
    throw new Error(`Question ${questionNo} answer.correct is invalid.`)
  }
  const result: PublishedQuestion = {
    question_no: questionNo,
    text_en: text(record.text_en, `Question ${questionNo} text_en`, true)!,
    answer: { type: answer.type, correct },
  }
  if (typeof record.category === "string") result.category = record.category
  const textVn = text(record.text_vn, `Question ${questionNo} text_vn`)
  if (textVn !== undefined) result.text_vn = textVn
  if (record.image_datas !== undefined) {
    if (!Array.isArray(record.image_datas) || !record.image_datas.every(item => typeof item === "string" && item.startsWith("asset:"))) {
      throw new Error(`Question ${questionNo} image_datas must contain only asset references.`)
    }
    result.image_datas = [...record.image_datas]
  }
  if (record.explanation !== undefined) {
    const explanation = plainRecord(record.explanation, `Question ${questionNo} explanation`)
    if (typeof explanation.en !== "string" || (explanation.vi !== undefined && typeof explanation.vi !== "string")) {
      throw new Error(`Question ${questionNo} explanation is invalid.`)
    }
    result.explanation = { en: explanation.en, ...(typeof explanation.vi === "string" ? { vi: explanation.vi } : {}) }
  }
  if (answer.choices !== undefined) result.answer.choices = structuredClone(plainRecord(answer.choices, `Question ${questionNo} answer.choices`)) as PublishedQuestion["answer"]["choices"]
  if (typeof answer.unit === "string") result.answer.unit = answer.unit
  if (typeof answer.otherChoiceKey === "string") result.answer.otherChoiceKey = answer.otherChoiceKey
  if (typeof answer.fixed === "boolean") result.answer.fixed = answer.fixed
  if (record.advancedDynamic !== undefined) {
    const dynamic = plainRecord(record.advancedDynamic, `Question ${questionNo} advancedDynamic`)
    const keys = ["paramsGeneratorTs", "questionGeneratorTs", "originParamsTs", "explanationGeneratorTs"] as const
    for (const key of keys) if (typeof dynamic[key] !== "string") throw new Error(`Question ${questionNo} advancedDynamic.${key} is required.`)
    result.dynamic = {
      paramsGeneratorTs: dynamic.paramsGeneratorTs as string,
      questionGeneratorTs: dynamic.questionGeneratorTs as string,
      originParamsTs: dynamic.originParamsTs as string,
      explanationGeneratorTs: dynamic.explanationGeneratorTs as string,
    }
  }
  return result
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]))
  }
  return value
}

export function canonicalQuestionJson(questions: PublishedQuestion[]): string {
  return JSON.stringify(canonicalize([...questions].sort((left, right) => left.question_no - right.question_no)))
}

export function hashPublishedQuestions(questions: PublishedQuestion[]): string {
  return createHash("sha256").update(canonicalQuestionJson(questions)).digest("hex")
}
