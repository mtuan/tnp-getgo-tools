import assert from "node:assert/strict";
import test from "node:test";
import { contentV2QuizReviewStatus } from "../src/features/topics/pages/quiz-manager/shared";

test("quiz review status counts actual matching content-v2 questions", () => {
  const snapshot = {
    contentV2: {
      questions: [
        { topicId: "ikmc", quizId: "quiz-a", status: "reviewed" },
        { topicId: "ikmc", quizId: "quiz-a", status: "pending" },
        { topicId: "ikmc", quizId: "quiz-b", status: "reviewed" },
        { topicId: "other", quizId: "quiz-a", status: "reviewed" },
      ],
    },
  };
  const quiz = {
    contest: "ikmc",
    id: "quiz-a",
    questionCount: 99,
    reviewedQuestionCount: 99,
  };
  assert.deepEqual(
    contentV2QuizReviewStatus(snapshot as never, quiz as never),
    { kind: "partial", label: "1/2", reviewed: 1, total: 2 },
  );
});
