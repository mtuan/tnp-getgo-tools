import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { marketplaceAccessCounts, marketplaceAccessPlan } from "../src/features/topics/domain/marketplace-access-plan.js";
import { applyMarketplaceAccessManagement } from "../src/features/topics/main/content-v2-marketplace-batch.js";

const candidates = (count: number) => Array.from({ length: count }, (_, order) => ({
  id: `quiz-${String(order).padStart(2, "0")}`,
  order,
  questionCount: 10,
  reviewedQuestionCount: 10,
}));

test("access counts keep a Premium majority while scaling previews and Free quizzes", () => {
  assert.deepEqual(marketplaceAccessCounts(1), { preview: 1, free: 0 });
  assert.deepEqual(marketplaceAccessCounts(2), { preview: 1, free: 0 });
  assert.deepEqual(marketplaceAccessCounts(3), { preview: 1, free: 1 });
  assert.deepEqual(marketplaceAccessCounts(4), { preview: 1, free: 1 });
  assert.deepEqual(marketplaceAccessCounts(5), { preview: 1, free: 2 });
  assert.deepEqual(marketplaceAccessCounts(6), { preview: 1, free: 2 });
  assert.deepEqual(marketplaceAccessCounts(7), { preview: 1, free: 3 });
  assert.deepEqual(marketplaceAccessCounts(11), { preview: 2, free: 4 });
});

test("access plan selects oldest quizzes as Free and newest quizzes as previews", () => {
  const plan = marketplaceAccessPlan(candidates(12));
  assert.deepEqual(plan.freeIds, ["quiz-00", "quiz-01", "quiz-02", "quiz-03"]);
  assert.deepEqual(plan.previewIds, ["quiz-10", "quiz-11"]);
  assert.deepEqual(plan.inheritedIds, candidates(12).slice(4).map(quiz => quiz.id));
});

test("access plan selects newest quizzes regardless of review state", () => {
  const quizzes = candidates(12);
  quizzes[11].reviewedQuestionCount = 9;
  assert.deepEqual(marketplaceAccessPlan(quizzes).previewIds, ["quiz-10", "quiz-11"]);
});

test("local access management skips experimental topics and persists the complete plan", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-access-plan-"));
  const writeTopic = async (id: string, experimental: boolean) => {
    const directory = path.join(root, "content-v2", "topics", id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "topic.json"), `${JSON.stringify({
      schemaVersion: 2, id, type: "competition", title: id, description: "", subjects: ["mathematics"], grades: [1],
      supportedLanguages: ["en"], status: "reviewed", order: 0, subject: "mathematics", rounds: [], gradeGroups: [],
      marketplace: { experimental, pricing: { type: "free", currency: "VND" } },
    }, null, 2)}\n`);
    for (let order = 0; order < 6; order += 1) {
      const quizId = `quiz-${order}`;
      const quizDirectory = path.join(directory, "quizzes", quizId);
      await fs.mkdir(path.join(quizDirectory, "questions"), { recursive: true });
      await fs.writeFile(path.join(quizDirectory, "quiz.json"), `${JSON.stringify({
        schemaVersion: 2, id: quizId, topicId: id, type: "competition-paper", title: quizId, description: "", sharedCode: "",
        status: "reviewed", order, supportedLanguages: ["en"], grade: "1", round: "main", year: "2026",
        marketplace: { preview: order === 0, pricing: { type: "paid", amount: 1000, currency: "VND" } },
      }, null, 2)}\n`);
      await fs.writeFile(path.join(quizDirectory, "questions", "question.json"), `${JSON.stringify({
        schemaVersion: 2, id: "question", type: "competition-question", order: 0, status: "reviewed",
        text: { en: "Question" }, assets: [], answer: { type: "input", correct: 1 },
      }, null, 2)}\n`);
    }
  };
  await writeTopic("public-topic", false);
  await writeTopic("experimental-topic", true);

  const result = await applyMarketplaceAccessManagement(root);
  const publicTopic = JSON.parse(await fs.readFile(path.join(root, "content-v2/topics/public-topic/topic.json"), "utf8"));
  const experimentalTopic = JSON.parse(await fs.readFile(path.join(root, "content-v2/topics/experimental-topic/topic.json"), "utf8"));
  const quizzes = await Promise.all(Array.from({ length: 6 }, async (_, order) => JSON.parse(await fs.readFile(
    path.join(root, `content-v2/topics/public-topic/quizzes/quiz-${order}/quiz.json`), "utf8"))));

  assert.equal(result.topicCount, 1);
  assert.equal(publicTopic.marketplace.pricing.type, "subscription");
  assert.equal(experimentalTopic.marketplace.pricing.type, "free");
  assert.deepEqual(quizzes.filter(quiz => quiz.marketplace.pricing?.type === "free").map(quiz => quiz.id), ["quiz-0", "quiz-1"]);
  assert.deepEqual(quizzes.filter(quiz => quiz.marketplace.preview).map(quiz => quiz.id), ["quiz-5"]);
  assert.ok(quizzes.slice(2).every(quiz => quiz.marketplace.pricing === undefined));
});
