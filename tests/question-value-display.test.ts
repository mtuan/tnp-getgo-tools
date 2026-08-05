import assert from "node:assert/strict"
import test from "node:test"
import { Fraction } from "@tnp/getgo-logics/quiz-builder"
import { displayQuestionValue } from "../src/core/question-value-display"

test("question values render live and serialized fractions as mixed numbers", () => {
  assert.equal(displayQuestionValue(new Fraction(5, 4)), "1 1/4")
  assert.equal(displayQuestionValue({ $type: "fraction", n: 9, d: 4 }), "2 1/4")
  assert.equal(displayQuestionValue({ n: 7, d: 3, value: 7 / 3 }), "2 1/3")
  assert.equal(displayQuestionValue(new Fraction(3, 4)), "3/4")
})
