import { promises as fs } from "node:fs"
import path from "node:path"
import type { PublishableQuiz, QuizSummary } from "../core/models.js"
import { hashPublishedQuestions, sanitizePublishedQuestion, type PublishedQuestion } from "../core/publishing.js"

export interface LocalPublishPayload {
  quiz: PublishableQuiz
  questions: PublishedQuestion[]
}

export async function createLocalPublishPayload(quiz: QuizSummary): Promise<LocalPublishPayload> {
  const directory = path.join(path.dirname(quiz.manifestPath), "questions")
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const files = entries.filter(entry => entry.isFile() && /^q\d+\.json$/i.test(entry.name))
  if (!files.length) throw new Error("This quiz has no question files to publish.")
  const questions = await Promise.all(files.map(async file => sanitizePublishedQuestion(JSON.parse(await fs.readFile(path.join(directory, file.name), "utf8")))))
  questions.sort((left, right) => left.question_no - right.question_no)
  const seen = new Set<number>()
  for (const question of questions) {
    if (seen.has(question.question_no)) throw new Error(`Question ${question.question_no} occurs more than once.`)
    seen.add(question.question_no)
  }
  return {
    quiz: {
      contestId: quiz.contest,
      quizId: quiz.id,
      title: quiz.title,
      grade: quiz.grade,
      round: quiz.round,
      year: quiz.year,
      questionCount: questions.length,
      contentHash: hashPublishedQuestions(questions),
    },
    questions,
  }
}

export async function recordPublishedHash(manifestPath: string, publishedHash: string, publishedAt: string): Promise<void> {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>
  manifest.publishedHash = publishedHash
  manifest.publishedAt = publishedAt
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8")
}
