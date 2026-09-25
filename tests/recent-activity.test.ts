import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyRecentActivity,
  orderByRecent,
  parseRecentActivity,
  questionActivityKey,
  quizActivityKey,
  recordRecentActivity,
} from "../src/features/topics/domain/recent-activity";

test("question activity updates its question, quiz, and topic", () => {
  const activity = recordRecentActivity(
    emptyRecentActivity(),
    { topicId: "maths", quizId: "quiz-1", questionNo: 7 },
    123,
  );
  assert.equal(activity.topics.maths, 123);
  assert.equal(activity.quizzes[quizActivityKey("maths", "quiz-1")], 123);
  assert.equal(
    activity.questions[questionActivityKey("maths", "quiz-1", 7)],
    123,
  );
});

test("recent ordering remains stable for items without activity", () => {
  const values = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(
    orderByRecent(values, { c: 20, a: 10 }, (value) => value.id),
    [{ id: "c" }, { id: "a" }, { id: "b" }],
  );
  assert.deepEqual(orderByRecent(values, {}, (value) => value.id), values);
});

test("invalid locally stored activity safely falls back", () => {
  assert.deepEqual(parseRecentActivity("not json"), emptyRecentActivity());
  assert.deepEqual(
    parseRecentActivity(JSON.stringify({
      topics: { valid: 10, invalid: "now" },
      quizzes: null,
      questions: [],
    })),
    { version: 1, topics: { valid: 10 }, quizzes: {}, questions: {} },
  );
});
