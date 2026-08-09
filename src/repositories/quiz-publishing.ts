import { promises as fs } from "node:fs"
import path from "node:path"
import type { ContestSummary, PublishableQuiz, QuizQuestionRecord, QuizSummary } from "../core/models.js"
import { hashPublishedQuestions, hashPublishedQuiz, sanitizePublishedQuestion, type PublishedQuestion } from "../core/publishing.js"

export interface LocalPublishPayload {
  quiz: PublishableQuiz
  contest?: {
    id: string
    title: string
    description: string
    icon?: string
    subject: number
    isActive: boolean
    settings: ContestSummary["settings"]
  }
  questions: PublishedQuestion[]
}

export function createPublishPayloadFromQuestions(quiz: QuizSummary, values: unknown[], contest?: ContestSummary): LocalPublishPayload {
  if (!values.length) throw new Error("This quiz has no question files to publish.")
  const questions = values.map(value => sanitizePublishedQuestion(value as QuizQuestionRecord)).sort((left, right) => left.question_no - right.question_no)
  const seen = new Set<number>()
  for (const question of questions) {
    if (seen.has(question.question_no)) throw new Error(`Question ${question.question_no} occurs more than once.`)
    seen.add(question.question_no)
  }
  const contentHash = hashPublishedQuiz(quiz, hashPublishedQuestions(questions))
  return {
    quiz: {
      contestId: quiz.contest,
      quizId: quiz.id,
      title: quiz.title,
      icon: quiz.icon,
      grade: quiz.grade,
      round: quiz.round,
      year: quiz.year,
      questionCount: questions.length,
      contentHash,
    },
    contest: contest ? {
      id: contest.id,
      title: contest.title,
      description: contest.description,
      icon: contest.settings.book.icon,
      subject: contest.subject,
      isActive: contest.isActive,
      settings: contest.settings,
    } : undefined,
    questions,
  }
}

export async function createLocalPublishPayload(quiz: QuizSummary): Promise<LocalPublishPayload> {
  const directory = path.join(path.dirname(quiz.manifestPath), "questions")
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = entries.filter(entry => entry.isFile() && /^q\d+\.json$/i.test(entry.name))
  const values = await Promise.all(files.map(async file => JSON.parse(await fs.readFile(path.join(directory, file.name), "utf8"))))
  return createPublishPayloadFromQuestions(quiz, values)
}

export async function recordPublishedHash(manifestPath: string, publishedHash: string, publishedAt: string): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>
  manifest.publishedHash = publishedHash
  manifest.publishedAt = publishedAt
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
}
