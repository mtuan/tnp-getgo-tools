import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { scanQuizRepository } from "../src/repositories/quiz-repository.js"

test("scans valid quizzes and reports malformed manifests", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-tools-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const valid = path.join(root, "quizzes", "seamo", "legacy-1")
  const invalid = path.join(root, "quizzes", "seamo", "legacy-2")
  await fs.mkdir(valid, { recursive: true }); await fs.mkdir(invalid, { recursive: true })
  await fs.writeFile(path.join(root, "quizzes", "seamo", "settings.json"), JSON.stringify({
    book: { code: "seamo", title: "SEAMO", subject: 1, isActive: true },
    rounds: [{ roundCode: "MAIN", roundName: "Main" }],
    grades: [{ gradeName: "1", grades: [1] }], categories: [], quizRules: [],
  }))
  await fs.writeFile(path.join(valid, "manifest.json"), JSON.stringify({
    schemaVersion: 1, id: "quiz-1", legacyId: "legacy-1", contest: "seamo", status: "reviewed",
    source: { format: "portal-client-v1", rawJsonSha256: "hash", quizTsSha256: "hash" },
    publishedHash: "a".repeat(64), publishedAt: "2026-08-04T00:00:00.000Z",
  }))
  await fs.writeFile(path.join(valid, "quiz.ts"), "export {}")
  await fs.writeFile(path.join(invalid, "manifest.json"), "{}")
  const result = await scanQuizRepository(root)
  assert.equal(result.quizzes.length, 1)
  assert.equal(result.contests[0].id, "seamo")
  assert.equal(result.contests[0].title, "SEAMO")
  assert.equal(result.quizzes[0].id, "quiz-1")
  assert.equal(result.quizzes[0].hasQuizTs, true)
  assert.equal(result.quizzes[0].questionStorageVersion, "legacy")
  assert.equal(result.quizzes[0].deploymentStatus, "not-built")
  assert.equal(result.quizzes[0].publishedHash, "a".repeat(64))
  assert.equal(result.quizzes[0].publishedAt, "2026-08-04T00:00:00.000Z")
  assert.equal(result.issues.length, 1)

  await fs.mkdir(path.join(valid, "questions"))
  await fs.writeFile(path.join(valid, "questions", "q1.json"), JSON.stringify({ question_no: 1 }))
  const converted = await scanQuizRepository(root)
  assert.equal(converted.quizzes[0].questionStorageVersion, "questions-v1")
})
