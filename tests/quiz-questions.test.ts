import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { loadQuizQuestions, saveQuizQuestion } from "../src/repositories/quiz-questions.js"

test("converts raw questions, extracts inline images, and then prefers q files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-questions-"))
  const manifestPath = path.join(directory, "manifest.json")
  await fs.writeFile(manifestPath, "{}")
  await fs.writeFile(path.join(directory, "raw.json"), JSON.stringify({ questions: [{
    question_no: 1,
    category: "logic",
    text_en: ["Which image?"],
    image_datas: ["data:image/png;base64,aGVsbG8="],
    answer: { correct: "A", choices: { A: "data:image/jpeg;base64,d29ybGQ=", B: "None" } },
  }] }))

  const converted = await loadQuizQuestions(manifestPath)
  assert.equal(converted.length, 1)
  assert.deepEqual(converted[0].image_datas, ["asset:question-1.png"])
  assert.equal((converted[0].answer as { choices: { A: string } }).choices.A, "asset:question-1-A.jpg")
  assert.equal(converted[0].authoringMode, "advanced-dynamic")
  assert.match(converted[0].advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.choice/)
  await fs.access(path.join(directory, "assets", "question-1.png"))
  await fs.access(path.join(directory, "assets", "question-1-A.jpg"))

  const changed = { ...converted[0], category: "updated", aiResponse: {
    generatedAt: "2026-08-03T00:00:00.000Z",
    model: "test-model",
    proposal: {
      paramsGeneratorTs: "() => ({})",
      questionGeneratorTs: "({}) => ({})",
      originParamsTs: "{ a: 2, d: 3 }",
      explanationGeneratorTs: "({}) => ({ en: '' })",
      parameterizedValues: [], explanation: "Test explanation", assumptions: [], warnings: [], confidence: 1,
    },
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, cachedInputTokens: 0, cacheWriteTokens: 0 },
  } }
  await saveQuizQuestion(manifestPath, changed)
  await fs.writeFile(path.join(directory, "raw.json"), JSON.stringify({ questions: [] }))
  const loaded = await loadQuizQuestions(manifestPath)
  assert.equal(loaded[0].category, "updated")
  assert.equal(loaded[0].aiResponse?.model, "test-model")
  assert.equal(loaded[0].aiResponse?.proposal.originParamsTs, "{ a: 2, d: 3 }")
  assert.equal(loaded[0].advancedDynamic?.explanationGeneratorTs, "({}) => {\n  return { en: '', vi: '' }\n}")
})
