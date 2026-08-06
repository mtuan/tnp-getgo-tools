import assert from "node:assert/strict"
import test from "node:test"
import { questionIsVerified, questionStatus, withQuestionStatus } from "../src/core/question-status.js"

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
