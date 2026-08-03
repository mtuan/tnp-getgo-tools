import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import type { ContestSettings } from "../src/core/models.js"
import { createContestDirectory, createQuizFiles, updateContestSettings, updateQuizManifest, updateQuizSource } from "../src/repositories/quiz-crud.js"
import { scanQuizRepository } from "../src/repositories/quiz-repository.js"

const settings: ContestSettings = {
  book: { code: "sample", title: "Sample Contest", description: "Initial", subject: 1, isActive: true },
  rounds: [{ roundCode: "MAIN", roundName: "Main Round", hasPractice: true }],
  grades: [{ gradeName: "1", grades: [1] }],
  categories: [{ categoryName: "Arithmetic", roundCodes: ["MAIN"], patterns: ["ARITHMETIC"] }],
  quizRules: [{ roundCode: "MAIN", gradeNames: ["*"], totalQuestions: 1, totalPoints: 4, timeLimit: 60, answerType: 0, categories: [{ categoryName: "Arithmetic", categoryNo: 1, questionCount: 1, correctPoints: 4, wrongPoints: 0, noAnswerPoints: 0 }] }],
}

test("creates and updates schema-backed contests and quizzes", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-crud-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, "quizzes"))
  await createContestDirectory(root, settings)
  await createQuizFiles(root, "sample", { id: "sample-quiz", title: "Sample Quiz", grade: "1", round: "MAIN", year: "2026" })
  const questionsDirectory = path.join(root, "quizzes", "sample", "sample-quiz", "questions")
  await fs.mkdir(questionsDirectory)
  await fs.writeFile(path.join(questionsDirectory, "q1.json"), JSON.stringify({ question_no: 1, verified: true }))
  await fs.writeFile(path.join(questionsDirectory, "q2.json"), JSON.stringify({ question_no: 2, verified: false }))

  let snapshot = await scanQuizRepository(root)
  assert.equal(snapshot.contests[0].settings.quizRules?.length, 1)
  assert.equal(snapshot.quizzes[0].title, "Sample Quiz")
  assert.equal(snapshot.quizzes[0].questionCount, 2)
  assert.equal(snapshot.quizzes[0].reviewedQuestionCount, 1)

  await updateContestSettings(root, "sample", { ...settings, book: { ...settings.book, description: "Updated", isActive: false } })
  await updateQuizManifest(snapshot.quizzes[0].manifestPath, { title: "Renamed Quiz", grade: "2", round: "FINAL", year: "2027" })
  snapshot = await scanQuizRepository(root)
  assert.equal(snapshot.contests[0].description, "Updated")
  assert.equal(snapshot.contests[0].isActive, false)
  assert.equal(snapshot.quizzes[0].title, "Renamed Quiz")
  assert.match(await fs.readFile(path.join(root, "quizzes", "sample", "sample-quiz", "quiz.ts"), "utf8"), /title: "Renamed Quiz"/)

  const source = "export default { questions: [] }\n"
  await updateQuizSource(snapshot.quizzes[0].manifestPath, source)
  const manifest = JSON.parse(await fs.readFile(snapshot.quizzes[0].manifestPath, "utf8")) as { source: { quizTsSha256: string } }
  assert.equal(manifest.source.quizTsSha256, createHash("sha256").update(source).digest("hex"))
})
