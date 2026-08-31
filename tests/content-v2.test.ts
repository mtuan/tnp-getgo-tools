import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertContentV2Relationship,
  contentV2QuestionSchema,
  contentV2TopicSchema,
  hashContentV2,
  sanitizeContentV2Topic,
  sanitizeContentV2Question,
  marketplaceTopicState,
  localizedText,
  sanitizeMarketplaceTopic,
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
import { sanitizeVietnamesePronunciationQuestion } from "../src/features/quiz-editor/domain/pronunciation-safety.js";
import { defaultSafeWordDictionary, findUnsafeContent } from "../src/features/content-safety/domain/content-safety.js";
import { assertRepositoryContentSafe, saveSafeWordDictionary } from "../src/features/content-safety/repository/content-safety-repository.js";
import { parseTextContentIcon } from "../src/shared/domain/content-icon.js";

test("content v2 contest text supports bilingual values and legacy strings", () => {
  const topic = contentV2TopicSchema.parse({
    schemaVersion: 2,
    id: "itmc-r1-3",
    type: "competition",
    title: { en: "ITMC - Round 1 - Grade 3", vi: "ITMC - Vòng 1 - Lớp 3" },
    description: { en: "International Talent Mathematics Contest", vi: "Kỳ thi Toán học Tài năng Quốc tế" },
    subject: "mathematics",
    rounds: [{ id: "r1", title: { en: "Round 1", vi: "Vòng 1" } }],
    gradeGroups: [{ id: "grade-3", title: { en: "Grade 3", vi: "Lớp 3" }, grades: [3] }],
  });
  assert.equal(localizedText(topic.title, "vi"), "ITMC - Vòng 1 - Lớp 3");
  assert.equal(localizedText("Legacy title", "vi"), "Legacy title");
});

test("content v2 text icons use an extensible object and accept legacy strings", () => {
  const icon = { type: "text" as const, text: "ITMC", color: "#059669" };
  const topic = contentV2TopicSchema.parse({
    schemaVersion: 2,
    id: "itmc-r1-3",
    type: "competition",
    title: "ITMC - Round 1 - Grade 3",
    subject: "mathematics",
    icon,
    rounds: [],
    gradeGroups: [],
  });
  assert.deepEqual(topic.icon, icon);
  assert.deepEqual(parseTextContentIcon(topic.icon), icon);
  assert.deepEqual(parseTextContentIcon("text:emerald:IKMC"), { ...icon, text: "IKMC" });
});

test("content safety finds bilingual whole words and reports their data paths", () => {
  const findings = findUnsafeContent({ text: { en: "This is shit", vi: "Không dùng từ đĩ" }, safe: "classic lesson" }, defaultSafeWordDictionary);
  assert.deepEqual(findings.map(item => [item.language, item.term, item.path]), [
    ["en", "shit", "$.text.en"],
    ["vi", "đĩ", "$.text.vi"],
  ]);
});

test("content safety catches Vietnamese slang and alternate spellings", () => {
  const variants = ["zú", "dú", "dzú", "vếu", "vãi", "cứt", "kứt", "đái"];
  for (const term of variants) {
    const findings = findUnsafeContent({ text: `Nội dung ${term} không phù hợp` }, defaultSafeWordDictionary);
    assert.ok(findings.some(item => item.language === "vi" && item.term === term), `Expected “${term}” to be blocked`);
  }
});

test("content safety publishing guard reads the repository dictionary directly", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-content-safety-"));
  await saveSafeWordDictionary(root, { schemaVersion: 1, words: { en: ["custom blocked phrase"], vi: [] } });
  await assert.rejects(
    assertRepositoryContentSafe(root, "Quiz", { text: "A custom blocked phrase appears here" }),
    /Quiz contains blocked content.*custom blocked phrase/u,
  );
  await assert.doesNotReject(assertRepositoryContentSafe(root, "Quiz", { text: "A safe lesson" }));
});

test("content safety permits approved phrases but still blocks other occurrences", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-content-safety-allowed-"));
  await saveSafeWordDictionary(root, {
    schemaVersion: 2,
    words: { en: [], vi: ["vú"] },
    allowedPhrases: { en: [], vi: ["động vật có vú"] },
  });
  await assert.doesNotReject(assertRepositoryContentSafe(root, "Quiz", { text: "Động vật có vú" }));
  await assert.rejects(assertRepositoryContentSafe(root, "Quiz", { text: "Động vật có vú và một từ vú khác" }), /blocked content/u);
});

test("pronunciation safety blanks unsafe forms without shifting tone columns", () => {
  const question = sanitizeVietnamesePronunciationQuestion({
    type: "pronunciation-sound",
    sounds: [{
      sound: { text: "i" },
      forms: [{ text: "đi" }, { text: "đí" }, { text: "đì" }, { text: "đỉ" }, { text: "đĩ", speech: "đĩ" }, { text: "đị" }],
    }],
  });
  assert.deepEqual(question.sounds?.[0]?.forms.map(form => form.text), ["đi", "đí", "đì", "đỉ", "", "đị"]);
  assert.deepEqual(question.sounds?.[0]?.forms[4], { text: "" });
});

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

test("marketplace topic publishing preserves the guest preview flag", () => {
  const published = sanitizeMarketplaceTopic({
    ...alphabetTopic,
    marketplace: { listed: true, preview: true },
  });
  assert.equal(published.preview, true);
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
