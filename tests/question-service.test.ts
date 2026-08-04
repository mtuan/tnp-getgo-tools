import assert from "node:assert/strict"
import test from "node:test"
import { questionService } from "../src/renderer/question-service"
import type { QuizQuestionRecord } from "../src/core/models"

const question = (fixed: boolean): QuizQuestionRecord => ({
  question_no: 1,
  text_en: "Pick one",
  answer: { type: "choice", correct: "A", fixed, choices: { A: "correct", B: "second", C: "third" } },
}) as QuizQuestionRecord

test("question service preserves fixed static choice order", () => {
  const generated = questionService.loadStatic(question(true), true)
  assert.deepEqual(Object.values(generated.question.answer.choices ?? {}), ["correct", "second", "third"])
  assert.equal(generated.question.answer.correct, "A")
})

test("question service regenerates non-fixed choices and remaps the correct label", () => {
  const record = question(false)
  const current = questionService.loadStatic(record).question
  const generated = questionService.loadStatic(record, true, current).question
  assert.notDeepEqual(Object.values(generated.answer.choices ?? {}), Object.values(current.answer.choices ?? {}))
  const correct = String(generated.answer.correct)
  assert.equal(generated.answer.choices?.[correct], "correct")
})
