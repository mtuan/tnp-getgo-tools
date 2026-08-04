import assert from "node:assert/strict"
import test from "node:test"
import { sanitizeQuestionForAi } from "../src/core/ai-question-sanitizer.js"

test("AI question payload preserves asset references without image contents", () => {
  const payload = sanitizeQuestionForAi({
    question_no: 9,
    image_datas: [
      "asset:question-9.png",
      "data:image/png;base64,c2VjcmV0LWltYWdl",
      { type: "svg", path: "asset:question-9.svg", params: { value: 4 }, content: "<svg>secret</svg>" },
    ],
    answer: {
      type: "image_choice",
      correct: "A",
      choices: {
        A: "asset:question-9-A.png",
        B: "data:image/png;base64,YW5vdGhlci1zZWNyZXQ=",
      },
    },
  })

  assert.deepEqual(payload.image_datas, [
    "asset:question-9.png",
    "[image content omitted]",
    { type: "svg", path: "asset:question-9.svg", params: { value: 4 }, content: "[image content omitted]" },
  ])
  assert.deepEqual((payload.answer as { choices: Record<string, string> }).choices, {
    A: "asset:question-9-A.png",
    B: "[image content omitted]",
  })
  assert.equal(JSON.stringify(payload).includes("c2VjcmV0"), false)
  assert.equal(JSON.stringify(payload).includes("<svg>"), false)
})

test("AI question payload removes binary values", () => {
  const payload = sanitizeQuestionForAi({
    question_no: 1,
    image_datas: [{ type: "image", bytes: new Uint8Array([1, 2, 3]) }],
    answer: { type: "input", correct: 4 },
  })
  assert.deepEqual(payload.image_datas, [{ type: "image", bytes: "[image content omitted]" }])
})

test("AI question payload removes bare base64 and inline SVG image strings", () => {
  const payload = sanitizeQuestionForAi({
    image_datas: [
      "a".repeat(128),
      "<svg viewBox=\"0 0 10 10\"><path d=\"secret\" /></svg>",
      "blob:https://getgo.local/secret-image",
    ],
  })

  assert.deepEqual(payload.image_datas, [
    "[image content omitted]",
    "[image content omitted]",
    "[image content omitted]",
  ])
})
