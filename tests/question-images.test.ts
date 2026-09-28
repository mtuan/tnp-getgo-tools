import assert from "node:assert/strict"
import test from "node:test"
import { questionContainsImages } from "../src/features/quiz-editor/domain/question-images.js"
import { imageAssetPath, imageAssetReference, parseImageAssetReference } from "../src/shared/domain/image-asset-reference.js"

test("detects image data in questions and nested answers", () => {
  assert.equal(questionContainsImages({ image_datas: ["asset:question-2.png"], answer: {} }), true)
  assert.equal(questionContainsImages({ answer: { type: "image_choice", choices: { A: "asset:answer-A.png" } } }), true)
  assert.equal(questionContainsImages({ answer: { choices: { A: "data:image/png;base64,abc" } } }), true)
  assert.equal(questionContainsImages({ image_datas: [], answer: { type: "text_choice", choices: { A: "A plain answer" } } }), false)
})

test("image asset references preserve dimensions without changing the storage path", () => {
  const reference = imageAssetReference("question-2.png", 640, 480)
  assert.equal(reference, "asset:question-2.png?width=640&height=480")
  assert.deepEqual(parseImageAssetReference(reference), {
    path: "question-2.png",
    width: 640,
    height: 480,
  })
  assert.equal(imageAssetPath(reference), "question-2.png")
  assert.equal(imageAssetPath("asset:legacy.png"), "legacy.png")
})
