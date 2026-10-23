import assert from "node:assert/strict";
import test from "node:test";
import type { ContentV2QuestionSummary } from "../src/shared/domain/models.js";
import { aiGeneratedQuizKeys } from "../src/features/topics/domain/ai-generation-status.js";

const question = (id: string, aiGenerated: boolean): ContentV2QuestionSummary => ({
  key: `topic/quiz/${id}`,
  topicId: "topic",
  quizId: "quiz",
  id,
  type: "competition-question",
  order: Number(id.slice(1)),
  status: "pending",
  filePath: `/${id}.json`,
  localHash: id,
  label: id,
  aiGenerated,
});

test("quiz AI status marks only quizzes with persisted AI-generated questions", () => {
  const keys = aiGeneratedQuizKeys([
    question("q1", true),
    question("q2", false),
    question("q3", true),
  ]);
  assert.deepEqual([...keys], ["topic/quiz"]);
});
