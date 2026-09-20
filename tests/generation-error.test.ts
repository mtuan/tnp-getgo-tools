import assert from "node:assert/strict"
import test from "node:test"
import { generationErrorDetail } from "../src/features/quiz-editor/domain/generation-error.js"

test("generation errors expose names, codes, stacks, and nested causes", () => {
  const nested = new RangeError("Set maximum size exceeded")
  const error = new Error("Question generation failed", { cause: nested }) as Error & { code?: string }
  error.code = "QUESTION_GENERATION_FAILED"

  const detail = generationErrorDetail(error)

  assert.equal(detail.summary, "Error [QUESTION_GENERATION_FAILED]: Question generation failed")
  assert.match(detail.detail, /Code: QUESTION_GENERATION_FAILED/)
  assert.match(detail.detail, /Cause 1: RangeError: Set maximum size exceeded/)
  assert.match(detail.detail, /Stack:/)
})

test("syntax errors map composed locations to editor fields without internal stacks", () => {
  const error = new SyntaxError('Unexpected token, expected "," (6:3)')
  const detail = generationErrorDetail(error, {
    source: ["QB.template(", "  () => {", "    return {}", "  },", "  ({ value }) => ({", "    broken", "  }),", ")"].join("\n"),
    sections: [
      { id: "params", startLineNumber: 2, endLineNumber: 4 },
      { id: "question", startLineNumber: 5, endLineNumber: 7 },
    ],
  })

  assert.equal(detail.summary, 'Question generator, line 2:3 — Unexpected token, expected ","')
  assert.match(detail.detail, /Field: Question generator/)
  assert.match(detail.detail, /Source: broken/)
  assert.doesNotMatch(detail.detail, /Stack:/)
})
