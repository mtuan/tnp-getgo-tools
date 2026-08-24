import assert from "node:assert/strict"
import test from "node:test"
import { questionService } from "../src/features/quiz-editor/components/question-service"
import {
  formatDynamicCodeExpression,
  originParamsEditorSource,
  originParamsValueFromEditor,
  quizSharedEditorContext,
} from "../src/features/quiz-editor/domain/question-dynamics"
import type { QuizQuestionRecord } from "../src/shared/domain/models"

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

test("question service opens a static question as an editable dynamic draft", () => {
  const draft = questionService.createDynamicDraft(question(true))
  assert.equal(draft.authoringMode, "advanced-dynamic")
  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /answer/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.select/)
  assert.match(draft.advancedDynamic?.explanationGeneratorTs ?? "", /return \{ en: "", vi: "" \}/)
})

test("question service converts ordered multiple inputs into an editable dynamic draft", () => {
  const draft = questionService.createDynamicDraft({
    question_no: 4,
    text_en: "Complete both answers",
    answer: {
      type: "multiple_input",
      correct: ["16", "91"],
      inputs: [
        { question_en: "Next term", inputType: "number" },
        { question_en: "31st term", question_vn: "Số hạng thứ 31", inputType: "number", unit: "items" },
      ],
    },
  } as QuizQuestionRecord)

  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /const answer1 = 16/)
  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /const answer2 = 91/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.inputs\(\[/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /question_en: "Next term"/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /question_vn: "Số hạng thứ 31"/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /correct: answer2/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /unit: "items"/)
})

test("question service prefers the concise input map when metadata is inferred", () => {
  const draft = questionService.createDynamicDraft({
    question_no: 4,
    text_en: "What comes next?",
    answer: {
      type: "multiple_input",
      correct: ["16", "20"],
      inputs: [
        { question_en: "1, 4, 7, 10, 13, ____", inputType: "number" },
        { question_en: "2, 5, 8, 11, 14, 17, ____", inputType: "number" },
      ],
    },
  } as QuizQuestionRecord)

  const source = draft.advancedDynamic?.questionGeneratorTs ?? ""
  assert.match(source, /QB\.answer\.inputs\(\{/)
  assert.match(source, /"1, 4, 7, 10, 13, ____": answer1/)
  assert.doesNotMatch(source, /question_en:/)
})

test("dynamic callback formatting never exposes Prettier's ASI guard", async () => {
  const formatted = await formatDynamicCodeExpression("({ answer }) => { return { answer } }")
  assert.equal(formatted.startsWith(";"), false)
  assert.match(formatted, /^\(\{ answer \}\) => \{\n/)
})

test("shared editor context terminates an IIFE before callback expressions", () => {
  const context = quizSharedEditorContext("const QS = (() => ({ value: 1 }))()")
  assert.equal(context.endsWith(";\n\n"), true)
  assert.doesNotThrow(() => new Function(`${context}(() => QS.value)`))
})

test("origin parameters use a visible callback wrapper without changing persistence", () => {
  const stored = `{
  seqText: '1, 4, 7, 10, 13, ...',
  answer1: 16,
}`
  const editor = originParamsEditorSource(stored)

  assert.match(editor, /^\(\) => \{\n  return \{/)
  assert.equal(originParamsValueFromEditor(editor), stored)
})
