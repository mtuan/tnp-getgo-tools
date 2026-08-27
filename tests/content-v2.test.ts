import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertContentV2Relationship,
  contentV2QuestionSchema,
  hashContentV2,
  sanitizeContentV2Topic,
  sanitizeContentV2Question,
  marketplaceTopicState,
  withMarketplaceTopicState,
} from "../src/features/topics/domain/content-v2.js";
import { buildContentV2QuestionsCode } from "../src/features/topics/main/firestore-publishing.js";
import {
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
  loadContentV2WorkspaceFromFiles,
  calculateContentV2QuizHash,
  readContentV2QuizPublishState,
  readContentV2TopicPublishState,
  resolveContentV2QuizSourcePdf,
  writeContentV2QuizPublishState,
  writeContentV2TopicPublishState,
} from "../src/features/topics/repository/content-v2-repository.js";
import { marketplaceSyncPlan } from "../src/features/topics/domain/marketplace-sync-plan.js";

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
  assert.deepEqual(withMarketplaceTopicState({}, "hidden"), {
    state: "hidden", listed: false, featured: false,
  });
  assert.equal(marketplaceTopicState({ listed: false }), "unlisted");
  assert.equal(marketplaceTopicState({ featured: true }), "featured");
  assert.equal(marketplaceTopicState(), "unlisted");
  assert.equal(marketplaceTopicState({ state: "removed" }), "unlisted");
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

test("a target-aware filesystem snapshot has an empty plan after every local hash is recorded", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-sync-idempotent-"));
  const topic = { ...alphabetTopic, marketplace: { state: "listed" as const } };
  const quiz = { ...alphabetQuiz, marketplace: { state: "listed" as const } };
  await saveContentV2Topic(root, topic);
  await saveContentV2Quiz(root, topic, quiz);
  await saveContentV2Question(root, topic, quiz, {
    schemaVersion: 2,
    id: "letter-a",
    type: "alphabet-letter",
    order: 0,
    status: "reviewed",
    letter: "a",
    uppercase: "A",
    lowercase: "a",
  });
  const before = (await loadContentV2WorkspaceFromFiles(root, { lightweight: false })).content;
  const topicSummary = before.topics[0]!;
  const quizSummary = before.quizzes[0]!;
  const target = { environment: "development", projectId: "project-dev" };
  await writeContentV2TopicPublishState(topicSummary.filePath, {
    schemaVersion: 1,
    targets: {
      [target.projectId]: {
        ...target,
        contentHash: topicSummary.localHash,
        marketplaceContentHash: topicSummary.marketplaceLocalHash!,
        publishedAt: "2026-08-17T00:00:00.000Z",
      },
    },
  });
  await writeContentV2QuizPublishState(quizSummary.filePath, {
    schemaVersion: 1,
    targets: {
      [target.projectId]: {
        ...target,
        contentHash: quizSummary.localHash,
        publishedAt: "2026-08-17T00:00:00.000Z",
        items: {},
      },
    },
  });

  const after = (await loadContentV2WorkspaceFromFiles(root, {
    lightweight: false,
    projectId: target.projectId,
  })).content;
  assert.deepEqual(marketplaceSyncPlan(after.topics, after.quizzes), []);
  assert.equal((await readContentV2TopicPublishState(topicSummary.filePath)).targets[target.projectId]?.contentHash, topicSummary.localHash);
});

test("v2 type registry rejects incompatible parent and child types", () => {
  assert.doesNotThrow(() =>
    assertContentV2Relationship("kid-learning", "alphabet", "quiz"),
  );
  assert.doesNotThrow(() =>
    assertContentV2Relationship("kid-learning", "spelling", "quiz"),
  );
  assert.doesNotThrow(() =>
    assertContentV2Relationship("kid-learning", "pronunciation", "quiz"),
  );
  assert.doesNotThrow(() =>
    assertContentV2Relationship(
      "pronunciation",
      "pronunciation-sound",
      "question",
    ),
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

test("pronunciation questions support an empty label for the unmarked tone", () => {
  const question = contentV2QuestionSchema.parse({
    schemaVersion: 2,
    id: "q1",
    order: 0,
    status: "pending",
    type: "pronunciation-sound",
    letter: { text: "b", speech: "bờ" },
    tones: [{ text: "" }, { text: "´" }],
    sounds: [{
      sound: { text: "a" },
      forms: [{ text: "ba" }, { text: "bá" }],
    }],
  });

  assert.equal(question.tones[0].text, "");
  assert.throws(() => contentV2QuestionSchema.parse({
    ...question,
    sounds: [{ sound: { text: "" }, forms: [{ text: "ba" }] }],
  }));
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

test("v2 publishing preserves a parameterless question reference", () => {
  const runtime = sanitizeContentV2Question({
    schemaVersion: 2,
    id: "q18",
    type: "competition-question",
    order: 17,
    status: "reviewed",
    text: { en: "Referenced question placeholder" },
    assets: [],
    answer: { type: "input", correct: "" },
    authoringMode: "reference",
    reference: { questionNo: 3 },
  });
  assert.equal(runtime.authoringMode, "reference");
  assert.deepEqual(runtime.reference, { questionNo: 3 });
  assert.equal("dynamic" in runtime, false);
});

test("v2 repository persists and loads typed topic content", async () => {
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
  const result = await loadContentV2WorkspaceFromFiles(root);
  assert.equal(result.content.topics.length, 1);
  assert.equal(result.content.quizzes[0]?.questionCount, 1);
  assert.equal(result.content.quizzes[0]?.reviewedQuestionCount, 1);
  assert.equal(result.content.questions[0]?.label, "A a");
  assert.equal(result.content.issues.length, 0);

  const lightweight = await loadContentV2WorkspaceFromFiles(root, { lightweight: true });
  assert.equal(lightweight.content.quizzes[0]?.questionCount, 1);
  assert.equal(lightweight.content.quizzes[0]?.reviewedQuestionCount, 1);
  assert.equal(lightweight.content.questions[0]?.status, "reviewed");
});

test("resolves a migrated quiz source PDF without scanning the repository", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-content-v2-source-pdf-"));
  const sourcePdf = path.join(root, "quizzes", "seamo", "seamo_paper_b_2016_123", "source.pdf");
  await fs.mkdir(path.dirname(sourcePdf), { recursive: true });
  await fs.writeFile(sourcePdf, "%PDF-1.4");

  assert.equal(
    await resolveContentV2QuizSourcePdf(root, "seamo-paper-b", "seamo-paper-b-2016-123"),
    sourcePdf,
  );
});

test("calculates the canonical quiz hash directly from current files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-content-v2-files-"));
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
  const reloadedHash = (await loadContentV2WorkspaceFromFiles(root)).content.quizzes[0]?.localHash;

  assert.ok(directHash);
  assert.equal(directHash, reloadedHash);
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
