import assert from "node:assert/strict"
import test from "node:test"
import { questionContainsImages } from "../src/features/quiz-editor/domain/question-images.js"

test("detects image data in questions and nested answers", () => {
  assert.equal(questionContainsImages({ image_datas: ["asset:question-2.png"], answer: {} }), true)
  assert.equal(questionContainsImages({ answer: { type: "image_choice", choices: { A: "asset:answer-A.png" } } }), true)
  assert.equal(questionContainsImages({ answer: { choices: { A: "data:image/png;base64,abc" } } }), true)
  assert.equal(questionContainsImages({ image_datas: [], answer: { type: "text_choice", choices: { A: "A plain answer" } } }), false)
})
