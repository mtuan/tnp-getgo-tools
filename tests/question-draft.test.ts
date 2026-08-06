import assert from "node:assert/strict"
import test from "node:test"
import { isCurrentQuestionDraftChange } from "../src/core/question-draft"

test("rejects editor changes emitted by a question that is no longer open", () => {
  assert.equal(isCurrentQuestionDraftChange("28", "29", "28"), false)
  assert.equal(isCurrentQuestionDraftChange("29", "29", "28"), false)
  assert.equal(isCurrentQuestionDraftChange("29", 29, 29), true)
})
