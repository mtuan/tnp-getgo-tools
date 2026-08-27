import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalQuestionJson,
  hashPublishedQuestions,
  sanitizePublishedQuestion,
} from "../src/features/topics/domain/publishing.js";
import { recordPublishedHash } from "../src/features/topics/repository/quiz-publishing.js";
import { loadContentV2Assets } from "../src/features/topics/repository/content-v2-repository.js";
import { createContentV2QuizPublishPreview } from "../src/features/topics/main/firestore-publishing.js";
import {
  contentV2PublishedItems,
  diffContentV2PublishedItems,
} from "../src/features/topics/domain/content-v2-publish-state.js";

test("content v2 quiz assets publish to quiz-scoped Storage paths", () => {
  const preview = createContentV2QuizPublishPreview(
    "kid-learning",
    {
      schemaVersion: 2,
      id: "english-alphabet",
      topicId: "kid-learning",
      type: "alphabet",
      title: "English Alphabet",
      description: "",
      sharedCode: "const sharedLetter = 'A';",
      status: "reviewed",
      order: 0,
      language: "en",
    },
    "free",
    [],
    {},
    [
      {
        reference: "asset:book.png",
        sourcePath: "/local/book.png",
        contentHash: "a".repeat(64),
        mimeType: "image/png",
        data: new Uint8Array(),
      },
    ],
    "b".repeat(64),
  );

  assert.equal(
    preview.firebaseStorage.uploads[0]?.destinationPath,
    "getgo-content-v2/topics/kid-learning/quizzes/english-alphabet/assets/book.png",
  );
  assert.equal(
    preview.firebaseStorage.uploads[0]?.localSourcePath,
    "/local/book.png",
  );
  assert.equal("assetIds" in preview.firestore.quizDocument.data, false);
  assert.equal("questionIds" in preview.firestore.quizDocument.data, false);
  assert.equal("resourceIds" in preview.firestore.quizDocument.data, false);
  assert.equal("assetDocuments" in preview.firestore, false);
  assert.equal(
    preview.firestore.quizDocument.data.sharedCode,
    "const sharedLetter = 'A';",
  );
  assert.equal(preview.firestore.quizDocument.data.access, "free");
  assert.equal(preview.firestore.marketplaceQuizDocument.data.access, "free");
  assert.equal(preview.firestore.marketplaceQuizDocument.data.questionCount, 0);
  assert.equal("sharedCode" in preview.firestore.marketplaceQuizDocument.data, false);
  assert.equal("questionsCode" in preview.firestore.marketplaceQuizDocument.data, false);

  const first = contentV2PublishedItems(preview);
  assert.equal(diffContentV2PublishedItems(undefined, first).changed.size, 3);
  assert.equal(diffContentV2PublishedItems(first, first).changed.size, 0);
  const withoutAsset = contentV2PublishedItems({
    ...preview,
    firebaseStorage: { uploads: [] },
  });
  const removed = diffContentV2PublishedItems(first, withoutAsset).removed;
  assert.deepEqual(removed, [
    {
      kind: "storage-object",
      path: "getgo-content-v2/topics/kid-learning/quizzes/english-alphabet/assets/book.png",
      hash: "a".repeat(64),
    },
  ]);
});

test("topic-owned assets are not assigned to a quiz publish state", async () => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-topic-assets-"));
  const topicAssets = path.join(repository, "content-v2", "topics", "kid-learning", "assets", "icons");
  await fs.mkdir(topicAssets, { recursive: true });
  await fs.writeFile(path.join(topicAssets, "topic-icon.png"), new Uint8Array([1, 2, 3]));
  const topic = { icon: "asset:icons/topic-icon.png" };

  assert.equal((await loadContentV2Assets(repository, "kid-learning", "english-alphabet", { quiz: {} })).length, 0);
  assert.equal((await loadContentV2Assets(repository, "kid-learning", undefined, { topic })).length, 1);
});

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

test("publishing rejects answer types without a shared cross-mode contract", () => {
  assert.throws(
    () => sanitizePublishedQuestion({
      question_no: 1,
      text_en: "Unsupported",
      answer: { type: "future-answer", correct: "1" },
    }),
    /not supported for publishing/,
  );
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

test("publishes rendering-only choice formatter source", () => {
  const question = sanitizePublishedQuestion({
    question_no: 1,
    text_en: "Pick a time",
    answer: {
      type: "choice",
      correct: "A",
      choices: {
        A: { $type: "maths-time", minutes: 1200 },
        B: { $type: "maths-time", minutes: 1230 },
      },
      format: {
        $type: "function",
        source: "(value) => value.format('hh:mm')",
      },
    },
  });
  assert.deepEqual(question.answer.format, {
    $type: "function",
    source: "(value) => value.format('hh:mm')",
  });
});

test("publishes the shared input control type for single-input answers", () => {
  const question = sanitizePublishedQuestion({
    question_no: 1,
    text_en: "Enter a number",
    answer: {
      type: "input",
      correct: "12",
      inputType: "number",
    },
  });
  assert.equal(question.answer.inputType, "number");
});

test("publishes alphabet questions with their independent runtime contract", () => {
  const question = sanitizePublishedQuestion({
    question_no: 1,
    type: "alphabet",
    letter: "A",
    uppercase: "A",
    lowercase: "a",
    pronunciation: "ay",
  });
  assert.deepEqual(question, {
    question_no: 1,
    type: "alphabet",
    letter: "A",
    uppercase: "A",
    lowercase: "a",
    pronunciation: "ay",
  });
  assert.equal("answer" in question, false);
  assert.equal("text_en" in question, false);
  assert.equal("samples" in question, false);
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
