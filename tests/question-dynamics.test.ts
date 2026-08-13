import assert from "node:assert/strict"
import test from "node:test"
import { questionHasDynamicParams } from "../src/features/quiz-editor/domain/question-dynamics.js"

test("identifies only parameter generators with named return values as dynamic", () => {
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "() => ({})" }), false)
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "() => { return {} }" }), false)
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "() => { const year = 2006; return { year } }" }), true)
  assert.equal(questionHasDynamicParams({ paramsGeneratorTs: "invalid TypeScript" }), false)
})
