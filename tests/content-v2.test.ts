import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertContentV2Relationship,
  hashContentV2,
  sanitizeContentV2Topic,
  sanitizeContentV2Question,
  marketplaceTopicState,
  withMarketplaceTopicState,
} from "../src/core/content-v2.js";
import { buildContentV2QuestionsCode } from "../src/main/firestore-publishing.js";
import {
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
  scanContentV2Repository,
  calculateContentV2QuizHash,
  readContentV2QuizPublishState,
  writeContentV2QuizPublishState,
} from "../src/repositories/content-v2-repository.js";

test("marketplace topic states map to remote listing flags", () => {
  assert.deepEqual(withMarketplaceTopicState({}, "listed"), {
    state: "listed", listed: true, featured: false,
  });
  assert.deepEqual(withMarketplaceTopicState({}, "featured"), {
    state: "featured", listed: true, featured: true,
  });
  assert.deepEqual(withMarketplaceTopicState({}, "unlisted"), {
    state: "unlisted", listed: false, featured: false,
  });
  assert.deepEqual(withMarketplaceTopicState({}, "removed"), {
    state: "removed", listed: false, featured: false,
  });
  assert.equal(marketplaceTopicState({ listed: false }), "unlisted");
  assert.equal(marketplaceTopicState({ featured: true }), "featured");
});

const alphabetTopic = {
  schemaVersion: 2 as const,
  id: "kid-learning",
  type: "kid-learning" as const,
  title: "Kids Learning",
  description: "",
  status: "reviewed" as const,
  order: 0,
  supportedLanguages: ["en", "vi"] as ("en" | "vi")[],
  recommendedAgeRange: { minimum: 3, maximum: 7 },
};

const alphabetQuiz = {
  schemaVersion: 2 as const,
  id: "english-alphabet",
  topicId: "kid-learning",
  type: "alphabet" as const,
  title: "English alphabet",
  description: "",
  status: "reviewed" as const,
  order: 0,
  language: "en" as const,
};

test("stores content-v2 publish state separately for each Firebase project", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-state-"));
  const quizFilePath = path.join(root, "quiz.json");
  await fs.writeFile(quizFilePath, "{}");
  await writeContentV2QuizPublishState(quizFilePath, {
    schemaVersion: 1,
    targets: {
      "project-dev": {
        environment: "development",
        projectId: "project-dev",
        contentHash: "a".repeat(64),
        publishedAt: "2026-08-06T00:00:00.000Z",
        items: {},
      },
    },
  });
  const state = await readContentV2QuizPublishState(quizFilePath);
  assert.equal(state.targets["project-dev"]?.environment, "development");
  assert.equal(state.targets["project-dev"]?.contentHash, "a".repeat(64));
});

test("v2 type registry rejects incompatible parent and child types", () => {
  assert.doesNotThrow(() =>
    assertContentV2Relationship("kid-learning", "alphabet", "quiz"),
  );
  assert.doesNotThrow(() =>
    assertContentV2Relationship("kid-learning", "spelling", "quiz"),
  );
  assert.throws(() =>
    assertContentV2Relationship("competition", "alphabet", "quiz"),
  );
  assert.throws(() =>
    assertContentV2Relationship(
      "alphabet",
      "competition-question",
      "question",
    ),
  );
});

test("v2 hashes ignore authoring and publishing metadata", () => {
  const first = hashContentV2(sanitizeContentV2Topic(alphabetTopic));
  const second = hashContentV2(
    sanitizeContentV2Topic({
      ...alphabetTopic,
      status: "draft",
      publishedHash: "a".repeat(64),
      publishedAt: "2026-08-06T00:00:00.000Z",
    }),
  );
  assert.equal(first, second);
});

test("v2 publishing excludes editor feedback", () => {
  const runtime = sanitizeContentV2Question({
    schemaVersion: 2,
    id: "q1",
    type: "competition-question",
    order: 0,
    status: "rejected",
    text: { en: "Question" },
    assets: [],
    answer: { type: "input", correct: "1" },
    feedback: {
      issues: ["wrong-answer"],
      note: "Editor-only note",
      updatedAt: "2026-08-06T00:00:00.000Z",
    },
  });
  assert.equal("status" in runtime, false);
  assert.equal("feedback" in runtime, false);
});

test("v2 repository persists and scans typed topic content", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-content-v2-"));
  await saveContentV2Topic(root, alphabetTopic);
  await saveContentV2Quiz(root, alphabetTopic, alphabetQuiz);
  await saveContentV2Question(root, alphabetTopic, alphabetQuiz, {
    schemaVersion: 2,
    id: "letter-a",
    type: "alphabet-letter",
    order: 0,
    status: "reviewed",
    letter: "a",
    uppercase: "A",
    lowercase: "a",
  });
  const result = await scanContentV2Repository(root);
  assert.equal(result.snapshot.topics.length, 1);
  assert.equal(result.snapshot.quizzes[0]?.questionCount, 1);
  assert.equal(result.snapshot.quizzes[0]?.reviewedQuestionCount, 1);
  assert.equal(result.snapshot.questions[0]?.label, "A a");
  assert.equal(result.snapshot.issues.length, 0);
});

test("calculates the canonical quiz hash directly from current files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-content-v2-cache-"));
  await saveContentV2Topic(root, alphabetTopic);
  await saveContentV2Quiz(root, alphabetTopic, alphabetQuiz);
  const question = {
    schemaVersion: 2 as const,
    id: "letter-h",
    type: "alphabet-letter" as const,
    order: 0,
    status: "reviewed" as const,
    letter: "H",
    uppercase: "H",
    lowercase: "h",
    pronunciation: "hát",
  };
  await saveContentV2Question(root, alphabetTopic, alphabetQuiz, question);
  await saveContentV2Question(root, alphabetTopic, alphabetQuiz, {
    ...question,
    pronunciation: "hờ",
  });
  const directHash = await calculateContentV2QuizHash(
    root,
    alphabetTopic.id,
    alphabetQuiz.id,
  );
  const rescannedHash = (await scanContentV2Repository(root)).snapshot.quizzes[0]?.localHash;

  assert.ok(directHash);
  assert.equal(directHash, rescannedHash);
});

test("builds deterministic question code in published order", () => {
  const question = {
    schemaVersion: 2 as const,
    id: "letter-a",
    type: "alphabet-letter" as const,
    order: 1,
    status: "reviewed" as const,
    letter: "A",
    uppercase: "A",
    lowercase: "a",
    pronunciation: "a",
  };
  const code = buildContentV2QuestionsCode([
    question,
    { ...question, id: "letter-b", order: 0, letter: "B" },
  ]);

  assert.deepEqual(JSON.parse(code), [
    sanitizeContentV2Question({ ...question, id: "letter-b", order: 0, letter: "B" }),
    sanitizeContentV2Question(question),
  ]);
});
