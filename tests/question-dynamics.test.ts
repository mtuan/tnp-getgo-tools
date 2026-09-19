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
    assert.equal(envelope.suffix, "\n);\n})()")
  }
  assert.doesNotMatch(base.prefix, /__GetGoParams/)
  assert.match(withParams.prefix, /type __GetGoParams = ReturnType/)
  assert.match(withParams.prefix, /QB\.rnd\.int/)
})
