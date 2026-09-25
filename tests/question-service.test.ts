import assert from "node:assert/strict"
import test from "node:test"
import {
  formatAuthoringChoice,
  questionService,
} from "../src/features/quiz-editor/components/question-service"
import {
  formatDynamicCodeExpression,
  dynamicEditorModelEnvelope,
  dynamicEditorValueFromModel,
  editorModelHasExtraEnvelopes,
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

test("preview choice formatter restores QB scope", () => {
  const answer = {
    format: {
      $type: "function",
      source: "value => QB.en.dayOfWeek(value, 'short')",
    },
  }
  assert.equal(formatAuthoringChoice(answer, 1), "Mon")
})

test("authoring runtime supports choices inside QB.answer.choice options", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ correct: QB.dayOfWeek.MONDAY, choices: [QB.dayOfWeek.SUNDAY, QB.dayOfWeek.MONDAY, QB.dayOfWeek.TUESDAY] })",
      questionGeneratorTs: "({ correct, choices }: __GetGoParams) => ({ question_no: 1, text_en: 'Day', answer: QB.answer.choice(correct, { choices, format: value => QB.en.dayOfWeek(value), fixed: true }) })",
      originParamsTs: "{ correct: 1, choices: [0, 1, 2] }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord
  const generated = await questionService.generateDynamic(record)
  assert.deepEqual(generated.question.answer.choices, {
    A: "Sunday",
    B: "Monday",
    C: "Tuesday",
  })
  assert.equal(generated.question.answer.correct, "B")
})

test("authoring runtime ignores undefined choices and generates distractors", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ correct: 58 })",
      questionGeneratorTs: "({ correct, choices }: __GetGoParams) => ({ question_no: 1, text_en: 'Stickers', answer: QB.answer.choice(correct, { choices, distractors: 3, fixed: true }) })",
      originParamsTs: "() => { const choices = [58, 88, 53, 63]; return { correct: 58, choices } }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.answer.correct, "A")
  assert.equal(Object.keys(generated.question.answer.choices ?? {}).length, 4)
})

test("authoring runtime exposes full, value, and expression-only calculations", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ n1: 1, n2: 2, denominator: 4 })",
      questionGeneratorTs: "({ n1, n2, denominator }: __GetGoParams) => { const expr = QB.maths.calc`${n1} / ${denominator} + ${n2} / ${denominator}`; return { question_no: 1, text_en: [expr.render(), expr.renderExpression()], answer: QB.answer.input(expr.value) } }",
      originParamsTs: "{ n1: 1, n2: 2, denominator: 4 }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.deepEqual(generated.question.text_en, ["1 ÷ 4 + 2 ÷ 4 = 0.75", "1 ÷ 4 + 2 ÷ 4"])
  assert.equal(generated.question.answer.correct, "0.75")
})

test("authoring runtime sums and renders the configured sequence terms", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ seq: QB.maths.sequence({ start: 3, step: 2, count: 4 }) })",
      questionGeneratorTs: "({ seq }: __GetGoParams) => ({ question_no: 1, text_en: seq.renderSum('sum'), text_vn: seq.renderSum(), answer: QB.answer.input(seq.sum()) })",
      originParamsTs: "{ seq: QB.maths.sequence({ start: 3, step: 2, count: 4 }) }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.text_en, "3 + 5 + 7 + 9 = 24")
  assert.equal(generated.question.text_vn, "3 + 5 + 7 + 9")
  assert.equal(generated.question.answer.correct, "24")
})

test("authoring runtime includes the answer inside every nested input", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ length: 12, width: 5 })",
      questionGeneratorTs: "({ length, width }: __GetGoParams) => ({ question_no: 1, text_en: 'Dimensions', answer: QB.answer.nested([{ question_en: 'Length', correct: length }, { question_en: 'Width', correct: width }]) })",
      originParamsTs: "{ length: 12, width: 5 }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.deepEqual(generated.question.answer.inputs?.map(part => part.correct), ["12", "5"])
  assert.deepEqual(generated.question.answer.correct, ["12", "5"])
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
  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /return \{\}/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /\(\{\}\) =>/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.choice\("correct", \[/)
  assert.match(draft.advancedDynamic?.explanationGeneratorTs ?? "", /return \{ en: "", vi: "" \}/)
})

test("question service keeps a static input answer inside the question generator", () => {
  const draft = questionService.createDynamicDraft({
    question_no: 12,
    text_en: "Find the missing number",
    answer: { type: "input", correct: 18, inputType: "number" },
  } as QuizQuestionRecord)

  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /return \{\}/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /\(\{\}\) =>/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /answer: QB\.answer\.input\(18\)/)
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

  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /return \{\}/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.nested\(\[/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /question_en: QB\.fmt`Next term`/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /question_vn: QB\.fmt`Số hạng thứ 31`/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /correct: 91/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /unit: "items"/)
  assert.doesNotMatch(draft.advancedDynamic?.questionGeneratorTs ?? "", /inputType:/)
})

test("question service converts multiple answers into an editable dynamic draft", () => {
  const draft = questionService.createDynamicDraft({
    question_no: 9,
    text_en: "Enter every prime factor",
    answer: { type: "multiple_answer", correct: ["2", "3", "5"] },
  } as QuizQuestionRecord)

  assert.match(draft.advancedDynamic?.paramsGeneratorTs ?? "", /return \{\}/)
  assert.match(draft.advancedDynamic?.questionGeneratorTs ?? "", /QB\.answer\.multiple\(\[\s*2,\s*3,\s*5\s*\]\)/)
  assert.doesNotMatch(draft.advancedDynamic?.questionGeneratorTs ?? "", /type:\s*["']multiple_answer/)
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
  assert.match(source, /QB\.answer\.nested\(\{/)
  assert.match(source, /"1, 4, 7, 10, 13, ____": 16/)
  assert.doesNotMatch(source, /question_en:/)
})

test("dynamic callback formatting never exposes Prettier's ASI guard", async () => {
  const formatted = await formatDynamicCodeExpression("({ answer }) => { return { answer } }")
  assert.equal(formatted.startsWith(";"), false)
  assert.match(formatted, /^\(\{ answer \}\) => \{\n/)
})

test("Monaco IntelliSense envelopes never leak into persisted generator code", () => {
  const callback = `() => {
  const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
  return { seq }
}`
  const outer = dynamicEditorModelEnvelope()
  const inner = dynamicEditorModelEnvelope()
  const onceWrapped = `${inner.prefix}${callback}${inner.suffix}`
  const twiceWrapped = `${outer.prefix}${onceWrapped}${outer.suffix}`

  assert.equal(dynamicEditorValueFromModel(onceWrapped, outer.prefix, outer.suffix), callback)
  assert.equal(dynamicEditorValueFromModel(twiceWrapped, outer.prefix, outer.suffix), callback)
  assert.equal(dynamicEditorValueFromModel(callback, outer.prefix, outer.suffix), callback)
})

test("legacy Monaco envelopes are removed from already-leaked generator code", () => {
  const callback = "() => ({ value: QB.rnd.int(1, 9) })"
  const legacy = `(() => {
const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
return (${callback}
);
})()`

  assert.equal(dynamicEditorValueFromModel(legacy), callback)
})

test("malformed nested legacy envelopes recover the editable callback", () => {
  const leaked = `(() => {
const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
return (
() => {
  return (() => {
  const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
  return (
    () => {
      const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
      return { seq }
    }
}
);
})()`

  assert.equal(dynamicEditorValueFromModel(leaked), `() => {
      const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
      return { seq }
    }`)
})

test("malformed marked envelopes are removed from original parameters", () => {
  const leaked = `(() => {
/* __GETGO_EDITOR_ENVELOPE_START__ */
const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
return (
() => {
return (() => {
/* __GETGO_EDITOR_ENVELOPE_START__ */
const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
return (
() => {
const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
const pos = 12
const answer = QB.answer.choice(75, [72, 75, 78, 69])
return { seq, pos, answer }
)
}
);
/* __GETGO_EDITOR_ENVELOPE_END__ */
})()`

  const recovered = originParamsValueFromEditor(leaked)
  assert.doesNotMatch(recovered, /GETGO_EDITOR_ENVELOPE|unknown as import/)
  assert.equal(recovered, `() => {
const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
const pos = 12
const answer = QB.answer.choice(75, [72, 75, 78, 69])
return { seq, pos, answer }
}`)
})

test("stored original-parameter callbacks are not wrapped a second time", () => {
  const callback = `() => {
  const value = 9
  return { value }
}`
  assert.equal(originParamsEditorSource(callback), callback)
  assert.equal(originParamsValueFromEditor(callback), callback)
})

test("structural recovery ignores completely damaged envelope closers", () => {
  const leaked = `(() => {
/* a damaged editor marker */
const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
return (
() => {
  const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
  const answer = QB.answer.choice(75, [72, 75, 78, 69])
  return { seq, answer }
)
}
this is not valid envelope syntax`

  assert.equal(dynamicEditorValueFromModel(leaked), `() => {
  const seq = QB.maths.sequence({ start: 9, step: 6, count: 4 })
  const answer = QB.answer.choice(75, [72, 75, 78, 69])
  return { seq, answer }
}`)
})

test("a repaired prop replaces a corrupted cached Monaco model", () => {
  const envelope = dynamicEditorModelEnvelope()
  const callback = "() => ({ value: 9 })"
  const expected = `${envelope.prefix}${callback}${envelope.suffix}`
  const corrupted = `${envelope.prefix}${expected}${envelope.suffix}`

  assert.equal(editorModelHasExtraEnvelopes(corrupted, expected), true)
  assert.equal(editorModelHasExtraEnvelopes(expected, expected), false)
})

test("incomplete dynamic code can be persisted as an uncompiled draft", async () => {
  const draft = questionService.createDynamicDraft(question(true))
  draft.advancedDynamic!.questionGeneratorTs = "({ value }) => {"

  assert.equal(await questionService.compileDynamicDraft(draft), undefined)
})

test("authoring runtime supports QB.maths.numbers before a vendored refresh", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ values: QB.maths.numbers({ length: 2, digits: [1, 2, 3], duplicate: false, where: value => value > 20 }) })",
      questionGeneratorTs: "({ values }: __GetGoParams) => ({ question_no: 1, text_en: 'Numbers', answer: QB.answer.input(values.join(',')) })",
      originParamsTs: "{ values: [12, 13, 21, 23, 31, 32] }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.answer.correct, "21,23,31,32")
})

test("authoring runtime supports filtered QB.maths.numbers ranges", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ values: QB.maths.numbers({ start: 3, end: 18, where: value => value % 5 === 0 }) })",
      questionGeneratorTs: "({ values }: __GetGoParams) => ({ question_no: 1, text_en: 'Numbers', answer: QB.answer.input(values.join(',')) })",
      originParamsTs: "{ values: [5, 10, 15] }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.answer.correct, "5,10,15")
})

test("authoring runtime supports localized wrapped day-of-week names", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ en: QB.en.dayOfWeek(QB.dayOfWeek.SATURDAY, 'short'), vi: QB.vi.dayOfWeek(QB.dayOfWeek.MONDAY) })",
      questionGeneratorTs: "({ en, vi }: __GetGoParams) => ({ question_no: 1, text_en: en, text_vn: vi, answer: QB.answer.input(en) })",
      originParamsTs: "{ en: 'Sat', vi: 'Thứ Hai' }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.text_en, "Sat")
  assert.equal(generated.question.text_vn, "Thứ Hai")
})

test("authoring runtime pluralizes a word without requiring a count", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ previousDay: 'Monday' })",
      questionGeneratorTs: "({ previousDay }: __GetGoParams) => ({ question_no: 1, text_en: QB.en.plural(previousDay), answer: QB.answer.input(previousDay) })",
      originParamsTs: "{ previousDay: 'Monday' }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.text_en, "Mondays")
})

test("authoring runtime supports QB.dayOfWeek.random", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ tomorrow: QB.dayOfWeek.random() })",
      questionGeneratorTs: "({ tomorrow }: __GetGoParams) => ({ question_no: 1, text_en: QB.en.dayOfWeek(tomorrow), answer: QB.answer.input(tomorrow) })",
      originParamsTs: "{ tomorrow: QB.dayOfWeek.MONDAY }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  for (let attempt = 0; attempt < 20; attempt++) {
    const generated = await questionService.generateDynamic(record)
    const value = Number(generated.question.answer.correct)
    assert.equal(Number.isInteger(value) && value >= 0 && value <= 6, true)
  }
})

test("authoring runtime accepts QB.dayOfWeek constants in maths time", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ time: QB.maths.time({ hours: 23, dow: QB.dayOfWeek.SUNDAY }).addHours(2) })",
      questionGeneratorTs: "({ time }: __GetGoParams) => ({ question_no: 1, text_en: time.dow, answer: QB.answer.input(time.dowValue ?? -1) })",
      originParamsTs: "{ time: QB.maths.time({ hours: 23, dow: 'Sunday' }).addHours(2) }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  const generated = await questionService.generateDynamic(record)
  assert.equal(generated.question.text_en, "Monday")
  assert.equal(generated.question.answer.correct, "1")
})

test("authoring runtime supports QB.maths.number before a vendored refresh", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ value: QB.maths.number({ length: 3, digits: [1, 2, 3], duplicate: false, odd: true, where: value => QB.maths.sumDigits(value) === 6 }) })",
      questionGeneratorTs: "({ value }: __GetGoParams) => ({ question_no: 1, text_en: 'Number', answer: QB.answer.input(value) })",
      originParamsTs: "{ value: 123 }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord

  for (let attempt = 0; attempt < 25; attempt++) {
    const generated = await questionService.generateDynamic(record)
    const value = Number(generated.question.answer.correct)
    assert.equal(value % 2, 1)
    assert.equal(String(value).split("").reduce((sum, digit) => sum + Number(digit), 0), 6)
  }
})

test("authoring runtime supports odd and even QB.rnd.int options before a vendored refresh", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ start: QB.rnd.int(1, 5, { odd: true }), end: QB.rnd.int(31, 39, { even: true }) })",
      questionGeneratorTs: "({ start, end }: __GetGoParams) => ({ question_no: 1, text_en: `${start}-${end}`, answer: QB.answer.input(start + end) })",
      originParamsTs: "{ start: 1, end: 32 }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord
  for (let attempt = 0; attempt < 25; attempt++) {
    const generated = await questionService.generateDynamic(record)
    assert.equal(Number(generated.params?.start) % 2, 1)
    assert.equal(Number(generated.params?.end) % 2, 0)
  }
})

test("authoring runtime supports bounded start-step-end sequences before a vendored refresh", async () => {
  const record = {
    ...question(true),
    authoringMode: "advanced-dynamic",
    advancedDynamic: {
      paramsGeneratorTs: "() => ({ values: QB.maths.sequence(1, 2, 8).toArray() })",
      questionGeneratorTs: "({ values }: __GetGoParams) => { const seq = QB.maths.sequence(1, 1, 10); return { question_no: 1, text_en: seq.toText(), text_vn: seq.toText({ start: 3, end: 2 }), answer: QB.answer.input(values.at(-1)!) } }",
      originParamsTs: "{ values: [1, 3, 5, 7] }",
      explanationGeneratorTs: "() => ({})",
    },
  } as QuizQuestionRecord
  const generated = await questionService.generateDynamic(record)
  assert.deepEqual(generated.params?.values, [1, 3, 5, 7])
  assert.equal(generated.question.text_en, "1, 2, 3, 4, 5, ..., 9, 10")
  assert.equal(generated.question.text_vn, "1, 2, 3, ..., 9, 10")
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

test("single-line converted origin parameters become a valid multiline editor callback", () => {
  const stored = `{ nextMonth: "August", nextMonthVn: "TÃ¡m", correct: "A", choices: { A: "June", B: "July" } }`
  const editor = originParamsEditorSource(stored)

  assert.equal(editor.split("\n").length, 3)
  assert.match(editor, /^\(\) => \{\n  return \{ nextMonth:/)
  assert.equal(originParamsValueFromEditor(editor), stored)
})
