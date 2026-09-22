import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewedTopicQuizzes,
  shouldPublishContainingTopic,
  shouldPublishContentV2Quiz,
  stalePublishedQuizIds,
} from "../src/features/topics/domain/content-v2-publish-policy.js";
import type { ContentV2QuizSummary } from "../src/shared/domain/models.js";

function quiz(
  id: string,
  topicId: string,
  status: ContentV2QuizSummary["status"],
  order: number,
  questionCount = 1,
  reviewedQuestionCount = questionCount,
): ContentV2QuizSummary {
  return {
    key: `${topicId}/${id}`,
    topicId,
    id,
    type: "alphabet",
    title: id,
    description: "",
    status,
    order,
    filePath: `/tmp/${id}.json`,
    localHash: "a".repeat(64),
    publishedHash: null,
    publishedAt: null,
    questionCount,
    reviewedQuestionCount,
    language: "en",
  };
}

test("topic publishing selects quizzes with no unreviewed questions, including empty quizzes", () => {
  const result = reviewedTopicQuizzes(
    [
      quiz("later", "letters", "pending", 2),
      quiz("incomplete", "letters", "reviewed", 0, 2, 1),
      quiz("empty", "letters", "reviewed", 0, 0, 0),
      quiz("other", "spelling", "reviewed", 0),
      quiz("first", "letters", "pending", 1),
    ],
    "letters",
  );
  assert.deepEqual(result.map((item) => item.id), ["empty", "first", "later"]);
});

test("quiz publishing creates its parent topic only when it is missing", () => {
  assert.equal(shouldPublishContainingTopic(false), true);
  assert.equal(shouldPublishContainingTopic(true), false);
});

test("topic sync publishes only missing, dirty, outdated, or contract-stale quizzes", () => {
  const current = {
    publishContractVersion: 4,
    environment: "development",
    projectId: "getgo-dev",
    contentHash: "current-hash",
    publishedAt: "2026-09-22T00:00:00.000Z",
    items: {},
  };
  assert.equal(shouldPublishContentV2Quiz("current-hash", 4, current), false);
  assert.equal(shouldPublishContentV2Quiz("new-hash", 4, current), true);
  assert.equal(shouldPublishContentV2Quiz("current-hash", 5, current), true);
  assert.equal(shouldPublishContentV2Quiz("current-hash", 4, { ...current, dirty: true }), true);
  assert.equal(shouldPublishContentV2Quiz("current-hash", 4, undefined), true);
});

test("topic publishing removes only quizzes that no longer exist locally", () => {
  assert.deepEqual(
    stalePublishedQuizIds(
      ["old-spelling", "english-alphabet", "removed-quiz"],
      ["english-alphabet", "draft-local-quiz"],
    ),
    ["old-spelling", "removed-quiz"],
  );
});
