import assert from "node:assert/strict"
import test from "node:test"
import {
  dynamicEditorModelEnvelope,
  questionHasDynamicParams,
} from "../src/features/quiz-editor/domain/question-dynamics.js"

test("identifies only parameter generators with named return values as dynamic", () => {
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "() => ({})" }), false)
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "() => { return {} }" }), false)
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "() => { const year = 2006; return { year } }" }), true)
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "invalid TypeScript" }), false)
})

test("every dynamic editor model receives a private typed QB binding", () => {
  const base = dynamicEditorModelEnvelope()
  const withParams = dynamicEditorModelEnvelope("() => ({ value: QB.rnd.int(1, 9) })")

  for (const envelope of [base, withParams]) {
    assert.match(envelope.prefix, /const QB = null as unknown as import\("@tnp\/getgo-logics\/quiz-builder\/QuizBuilder"\)\.QuizBuilder/)
    assert.equal(envelope.prefix.endsWith("return ("), true)
    assert.equal(envelope.suffix, "\n);\n/* __GETGO_EDITOR_ENVELOPE_END__ */\n})()")
  }
  assert.doesNotMatch(base.prefix, /__GetGoParams/)
  assert.match(withParams.prefix, /type __GetGoParams = ReturnType/)
  assert.match(withParams.prefix, /QB\.rnd\.int/)
})

test("question params merge generated and original parameter properties", () => {
  const envelope = dynamicEditorModelEnvelope(
    "() => ({ lily: 1, tom: 2 })",
    "{ sum: 3, more: 'yes', lily: 'one' }",
  )

  assert.match(envelope.prefix, /const __getgoOriginParamsForEditor = \(\(\) => \(\{ sum: 3, more: 'yes', lily: 'one' \}\)\)/)
  assert.match(envelope.prefix, /type __GetGoParams = __GetGoMergeParams/)
  assert.match(envelope.prefix, /Exclude<keyof Original, keyof Generated>\]\?: Original\[Key\]/)
  assert.match(envelope.prefix, /ReturnType<typeof __getgoOriginParamsForEditor>/)
})

test("question params infer callback-style original parameters", () => {
  const envelope = dynamicEditorModelEnvelope(
    "() => ({ sum: 146, more: 30 })",
    "() => { const choices = [58, 88, 53, 63]; return { sum: 146, more: 30, choices } }",
  )

  assert.match(envelope.prefix, /const __getgoOriginParamsForEditor = \(\(\) => \{/)
  assert.match(envelope.prefix, /ReturnType<typeof __getgoOriginParamsForEditor>/)
})
