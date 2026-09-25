import assert from "node:assert/strict"
import test from "node:test"
import { questionIsVerified, questionStatus, withQuestionStatus } from "../src/features/quiz-editor/domain/question-status.js"
import { comparableQuestion } from "../src/features/topics/pages/quiz-manager/shared.js"
import type { QuizQuestionRecord } from "../src/shared/domain/models.js"

test("legacy verified values remain compatible without treating false as rejected", () => {
  assert.equal(questionStatus({ verified: true }), "verified")
  assert.equal(questionStatus({ verified: false }), "pending")
  assert.equal(questionStatus({}), "pending")
})

test("new status takes priority and supports future values", () => {
  assert.equal(questionStatus({ status: "rejected", verified: true }), "rejected")
  assert.equal(questionStatus({ status: "needs-translation" }), "needs-translation")
  assert.equal(questionIsVerified({ status: "verified" }), true)
})

test("writing a new status removes the legacy field and pending remains empty", () => {
  assert.deepEqual(withQuestionStatus({ question_no: 1, verified: true }, "rejected"), { question_no: 1, status: "rejected" })
  assert.deepEqual(withQuestionStatus({ question_no: 1, status: "verified", verified: true }, "pending"), { question_no: 1 })
})

test("review status and Monaco newline normalization do not dirty a question", () => {
  const stored = {
    question_no: 16,
    status: "pending",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({})",
      questionGeneratorTs: "() => ({\r\n  question_no: 16,\r\n})",
      originParamsTs: "{}",
      explanationGeneratorTs: "({}) => ({ en: '', vi: '' })",
      compiledJs: "return 'stored build'",
      quizBuilderApiVersion: 1,
    },
  } as QuizQuestionRecord
  const editorDraft = {
    ...stored,
    status: "verified",
    advancedDynamic: {
      ...stored.advancedDynamic!,
      questionGeneratorTs: "() => ({\n  question_no: 16,\n})",
      compiledJs: "return 'rebuilt while changing status'",
      quizBuilderApiVersion: 2,
    },
  }

  assert.deepEqual(comparableQuestion(editorDraft), comparableQuestion(stored))
})
