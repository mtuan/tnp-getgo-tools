import assert from "node:assert/strict"
import test from "node:test"
import { answerTypeDefinitions, staticAnswerType } from "../src/core/answer-types.js"

test("static answer editor exposes single input, multiple inputs, and choice", () => {
  assert.deepEqual(answerTypeDefinitions.map(definition => definition.id), ["input", "multiple_input", "choice"])
})

test("stored answer aliases resolve to the supported editor type", () => {
  assert.equal(staticAnswerType("input"), "input")
  assert.equal(staticAnswerType("numeric"), "input")
  assert.equal(staticAnswerType("multiple_input"), "multiple_input")
  assert.equal(staticAnswerType("text_choice"), "choice")
  assert.equal(staticAnswerType("multiple_choice"), "choice")
  assert.equal(staticAnswerType("future_answer", true), "choice")
})
