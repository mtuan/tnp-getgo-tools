import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadContentV2Question,
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../src/features/topics/repository/content-v2-repository.js";
import { reviewAllContentV2Questions } from "../src/features/topics/repository/content-v2-question-review.js";

test("reviews all content-v2 questions and invalidates the quiz once", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-v2-review-all-"));
  const topic = await saveContentV2Topic(root, {
    schemaVersion: 2,
    id: "math",
    type: "competition",
    title: "Math",
    subject: "mathematics",
    marketplace: { state: "unlisted" },
  });
  const quiz = await saveContentV2Quiz(root, topic, {
    schemaVersion: 2,
    id: "quiz-one",
    topicId: topic.id,
    type: "competition-paper",
    title: "Quiz one",
    grade: "3",
    round: "main",
    year: "2005",
    marketplace: { state: "unlisted" },
  });
  for (const order of [1, 2])
    await saveContentV2Question(root, topic, quiz, {
      schemaVersion: 2,
      id: `q${order}`,
      type: "competition-question",
      order,
      status: order === 2 ? "reviewed" : "draft",
      text: { en: `Question ${order}` },
      answer: { type: "input", correct: String(order) },
    });

  const result = await reviewAllContentV2Questions(root, topic, quiz);

  assert.deepEqual(result, { reviewed: 2, changed: 1 });
  assert.equal(
    (await loadContentV2Question(root, topic.id, quiz.id, "q1")).status,
    "reviewed",
  );
  assert.equal(
    (await loadContentV2Question(root, topic.id, quiz.id, "q2")).status,
    "reviewed",
  );
});
