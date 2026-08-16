import assert from "node:assert/strict";
import test from "node:test";
import { marketplaceSyncPlan } from "../src/features/topics/domain/marketplace-sync-plan";

test("marketplace sync plan describes only changed remote documents", () => {
  const topic = (id: string, values: Record<string, unknown>) => ({
    id, title: id, marketplaceLocalHash: "local", publishedAt: "now", ...values,
  });
  const plan = marketplaceSyncPlan([
    topic("create", { marketplace: { state: "listed" }, marketplacePublishedHash: null }),
    topic("update", { marketplace: { state: "featured" }, publishedHash: "old", marketplacePublishedHash: "old" }),
    topic("remove", { marketplace: { state: "unlisted" }, publishedHash: "old", marketplacePublishedHash: "old" }),
    topic("current", { marketplace: { state: "listed" }, marketplacePublishedHash: "local" }),
    topic("removed", { marketplace: { state: "unlisted" }, publishedHash: null, marketplacePublishedHash: null }),
  ] as never);
  assert.deepEqual(plan.map(({ topic: item, action }) => [item.id, action]), [
    ["create", "create"],
    ["update", "update"],
    ["remove", "remove"],
  ]);
});

test("marketplace sync plan includes changed quizzes and review readiness", () => {
  const topics = [{ id: "ikmc", title: "IKMC", localHash: "topic", publishedHash: "topic", marketplaceLocalHash: "market", marketplacePublishedHash: "market", marketplace: { state: "listed" } }];
  const quizzes = [
    { key: "ikmc/ready", id: "ready", topicId: "ikmc", title: "Ready", localHash: "new", publishedHash: "old", questionCount: 2, reviewedQuestionCount: 2, marketplace: { state: "listed" } },
    { key: "ikmc/pending", id: "pending", topicId: "ikmc", title: "Pending", localHash: "new", publishedHash: null, questionCount: 2, reviewedQuestionCount: 1, marketplace: { state: "listed" } },
  ];
  const plan = marketplaceSyncPlan(topics as never, quizzes as never);
  assert.deepEqual(plan.map((item) => [item.kind, item.kind === "quiz" ? item.quiz.id : item.topic.id, item.action, item.ready]), [
    ["topic", "ikmc", "update", true],
    ["quiz", "ready", "update", true],
    ["quiz", "pending", "create", false],
  ]);
});

test("unreviewed quiz changes do not create an empty actionable topic row", () => {
  const topics = [{ id: "ikmc", title: "IKMC", localHash: "topic", publishedHash: "topic", marketplaceLocalHash: "market", marketplacePublishedHash: "market", marketplace: { state: "listed" } }];
  const quizzes = [
    { key: "ikmc/pending", id: "pending", topicId: "ikmc", title: "Pending", localHash: "new", publishedHash: null, questionCount: 2, reviewedQuestionCount: 1, marketplace: { state: "listed" } },
  ];
  const plan = marketplaceSyncPlan(topics as never, quizzes as never);
  assert.deepEqual(plan.map((item) => [item.kind, item.kind === "quiz" ? item.quiz.id : item.topic.id, item.ready]), [
    ["quiz", "pending", false],
  ]);
});
