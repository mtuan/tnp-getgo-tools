import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { loadQuizQuestions, normalizeLegacyOriginParamsSource, resetQuizQuestion, saveQuizQuestion } from "../src/repositories/quiz-questions.js"

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
    processingTimeMs: 12_345,
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
  assert.equal(loaded[0].aiResponse?.processingTimeMs, 12_345)
  assert.equal(loaded[0].aiResponse?.proposal.originParamsTs, "{ a: 2, d: 3 }")
  assert.equal(loaded[0].advancedDynamic?.explanationGeneratorTs, "({}) => {\n  return { en: '', vi: '' }\n}")

  const questionPath = path.join(directory, "questions", "q1.json")
  const unformatted = JSON.parse(await fs.readFile(questionPath, "utf8"))
  unformatted.advancedDynamic.questionGeneratorTs = "({}) => {\n return {\nquestion_no: 1,\n answer: QB.answer.choice('A', { A: 'one', B: 'two' })\n}\n}"
  await fs.writeFile(questionPath, JSON.stringify(unformatted))
  const formattedOnLoad = await loadQuizQuestions(manifestPath)
  assert.match(formattedOnLoad[0].advancedDynamic?.questionGeneratorTs ?? "", /\n  return \{\n    question_no: 1,/)

  const reset = await resetQuizQuestion(manifestPath, {
    ...formattedOnLoad[0],
    aiFixHistory: [{ generatedAt: "2026-08-03T00:01:00.000Z" } as never],
  })
  assert.equal(reset.aiResponse, undefined)
  assert.equal(reset.aiFixHistory, undefined)
  assert.equal(reset.verified, false)
  assert.equal(reset.authoringMode, "advanced-dynamic")
  assert.equal(reset.advancedDynamic?.paramsGeneratorTs, "() => {\n  return {}\n}")
  assert.match(reset.advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.choice/)

  const reloadedReset = await loadQuizQuestions(manifestPath)
  assert.equal(reloadedReset[0].aiResponse, undefined)
  assert.equal(reloadedReset[0].aiFixHistory, undefined)
})

test("creates and resets question files from raw.ts before falling back to raw.json", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-questions-ts-"))
  const manifestPath = path.join(directory, "manifest.json")
  await fs.writeFile(manifestPath, "{}")
  await fs.writeFile(path.join(directory, "raw.json"), JSON.stringify({ questions: [{ question_no: 1, category: "json fallback", text_en: "JSON", answer: { correct: "JSON" } }] }))
  await fs.writeFile(path.join(directory, "raw.ts"), `import QB from 'legacy-builder'
export default { questions: [
  QB.template(
    { value: 4 },
    () => ({ value: 5 }),
    ({ value }) => ({ question_no: 1, category: 'TypeScript source', text_en: \`Value: \${value}\`, answer: QB.answer.input(value) }),
  ),
] }
`)

  const created = await loadQuizQuestions(manifestPath)
  assert.equal(created[0].category, "TypeScript source")
  assert.equal(created[0].text_en, "Value: 4")
  assert.match(created[0].advancedDynamic?.paramsGeneratorTs ?? "", /value: 5/)
  assert.match(created[0].advancedDynamic?.questionGeneratorTs ?? "", /Value:/)
  assert.equal(created[0].advancedDynamic?.originParamsTs, "{ value: 4 }")

  const reset = await resetQuizQuestion(manifestPath, { ...created[0], category: "edited", aiResponse: {} as never })
  assert.equal(reset.category, "TypeScript source")
  assert.equal(reset.aiResponse, undefined)
  assert.match(reset.advancedDynamic?.paramsGeneratorTs ?? "", /value: 5/)
})

test("recovers incomplete raw.ts origin fixtures from the matching raw.json question", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-questions-origin-fallback-"))
  const manifestPath = path.join(directory, "manifest.json")
  await fs.writeFile(manifestPath, "{}")
  await fs.writeFile(path.join(directory, "raw.json"), JSON.stringify({ questions: [{
    question_no: 1,
    text_en: "The saved list totals 600.",
    answer: { type: "input", correct: 600 },
  }] }))
  await fs.writeFile(path.join(directory, "raw.ts"), `import QB from 'legacy-builder'
export default { questions: [
  QB.template(
    () => ({ values: [100, 200, 300] }),
    ({ values }) => ({ question_no: 1, text_en: \`Total: \${values.reduce((a, b) => a + b, 0)}\`, answer: QB.answer.input(600) }),
    {},
  ),
] }
`)

  const created = await loadQuizQuestions(manifestPath)
  assert.equal(created.length, 1)
  assert.equal(created[0].text_en, "The saved list totals 600.")
  assert.equal((created[0].answer as { correct: number }).correct, 600)
  assert.match(created[0].advancedDynamic?.questionGeneratorTs ?? "", /values\.reduce/)
  assert.deepEqual(created[0].migrationError, {
    stage: "origin-render",
    message: "Cannot read properties of undefined (reading 'reduce')",
  })
})

test("normalizes legacy original-parameter callbacks into object expressions", () => {
  assert.equal(normalizeLegacyOriginParamsSource("() => ({ pairs: 25, feet: 100 })"), "{ pairs: 25, feet: 100 }")
  assert.equal(normalizeLegacyOriginParamsSource("() => { return { pairs: 25, feet: 100 }; }"), "{ pairs: 25, feet: 100 }")
  assert.equal(normalizeLegacyOriginParamsSource("{ pairs: 25, feet: 100 }"), "{ pairs: 25, feet: 100 }")
})
