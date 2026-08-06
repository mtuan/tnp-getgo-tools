import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalQuestionJson,
  hashPublishedQuestions,
  sanitizePublishedQuestion,
} from "../src/core/publishing.js";
import { recordPublishedHash } from "../src/repositories/quiz-publishing.js";

const dynamic = {
  paramsGeneratorTs: "() => ({ value: QB.rnd.int(1, 9) })",
  questionGeneratorTs:
    "({ value }) => ({ question_no: 1, text_en: `${value}`, answer: { type: 'input', correct: `${value}` } })",
  originParamsTs: "{ value: 4 }",
  explanationGeneratorTs: "({ value }) => ({ en: `${value}`, vi: `${value}` })",
  draftSourceTs: "must not be published",
};

test("publishes only allowlisted runtime question fields and dynamic fragments", () => {
  const question = sanitizePublishedQuestion({
    question_no: 1,
    category: "Arithmetic",
    text_en: "Value?",
    text_vn: "Giá trị?",
    answer: { type: "input", correct: "4" },
    explanation: { en: "Four.", vi: "Bốn." },
    advancedDynamic: dynamic,
    verified: true,
    aiResponse: { proposal: dynamic, generatedAt: "now" } as never,
    aiFixHistory: [{ generatedAt: "now" }] as never,
    samples: [{ value: 8 }],
  });
  assert.deepEqual(Object.keys(question).sort(), [
    "answer",
    "category",
    "dynamic",
    "explanation",
    "question_no",
    "text_en",
    "text_vn",
  ]);
  assert.deepEqual(Object.keys(question.dynamic!).sort(), [
    "explanationGeneratorTs",
    "originParamsTs",
    "paramsGeneratorTs",
    "questionGeneratorTs",
  ]);
  assert.equal(JSON.stringify(question).includes("draftSourceTs"), false);
  assert.equal(JSON.stringify(question).includes("aiResponse"), false);
  assert.equal(JSON.stringify(question).includes("verified"), false);
  assert.equal(JSON.stringify(question).includes("samples"), false);
});

test("AI and review changes do not affect hashes, but dynamic code changes do", () => {
  const base = {
    question_no: 1,
    text_en: "Value?",
    answer: { type: "input", correct: "4" },
    advancedDynamic: dynamic,
  };
  const first = sanitizePublishedQuestion({
    ...base,
    verified: false,
    aiResponse: { generatedAt: "one" } as never,
  });
  const second = sanitizePublishedQuestion({
    ...base,
    verified: true,
    aiResponse: { generatedAt: "two" } as never,
  });
  assert.equal(
    hashPublishedQuestions([first]),
    hashPublishedQuestions([second]),
  );
  const changed = sanitizePublishedQuestion({
    ...base,
    advancedDynamic: { ...dynamic, paramsGeneratorTs: "() => ({ value: 5 })" },
  });
  assert.notEqual(
    hashPublishedQuestions([first]),
    hashPublishedQuestions([changed]),
  );
});

test("publishes fixed choice ordering as runtime answer metadata", () => {
  const question = sanitizePublishedQuestion({
    question_no: 1,
    text_en: "Pick",
    answer: {
      type: "choice",
      correct: "A",
      choices: { A: "First", B: "Second" },
      fixed: true,
    },
  });
  assert.equal(question.answer.fixed, true);
});

test("publishes alphabet questions with their independent runtime contract", () => {
  const question = sanitizePublishedQuestion({
    question_no: 1,
    type: "alphabet",
    letter: "A",
    uppercase: "A",
    lowercase: "a",
    pronunciation: "ay",
    samples: [{ text: "Apple", meaning: "A fruit", image: "asset:apple.png" }],
  });
  assert.deepEqual(question, {
    question_no: 1,
    type: "alphabet",
    letter: "A",
    uppercase: "A",
    lowercase: "a",
    pronunciation: "ay",
    samples: [{ text: "Apple", meaning: "A fruit", image: "asset:apple.png" }],
  });
  assert.equal("answer" in question, false);
  assert.equal("text_en" in question, false);
});

test("canonical hashing ignores question and object-key ordering", () => {
  const one = sanitizePublishedQuestion({
    question_no: 1,
    text_en: "One",
    answer: { type: "input", correct: "1" },
  });
  const two = sanitizePublishedQuestion({
    question_no: 2,
    text_en: "Two",
    answer: { correct: "2", type: "input" },
  });
  assert.equal(
    hashPublishedQuestions([one, two]),
    hashPublishedQuestions([two, one]),
  );
  assert.equal(
    canonicalQuestionJson([two, one]),
    canonicalQuestionJson([one, two]),
  );
});

test("image contents and non-asset references cannot be published", () => {
  assert.throws(
    () =>
      sanitizePublishedQuestion({
        question_no: 1,
        text_en: "Image",
        image_datas: ["data:image/png;base64,abc"],
        answer: { type: "input", correct: "1" },
      }),
    /asset references/,
  );
});

test("records the last successful published hash in the local quiz manifest", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "getgo-publishing-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const manifestPath = path.join(directory, "manifest.json");
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ id: "quiz", untouched: true }),
  );
  const hash = "b".repeat(64);
  await recordPublishedHash(manifestPath, hash, "2026-08-04T01:00:00.000Z");
  const saved = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.deepEqual(saved, {
    id: "quiz",
    untouched: true,
    publishedHash: hash,
    publishedAt: "2026-08-04T01:00:00.000Z",
  });
});
