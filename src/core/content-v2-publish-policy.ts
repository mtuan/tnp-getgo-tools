import type { ContentV2QuizSummary } from "./models.js";

export function reviewedTopicQuizzes(
  quizzes: ContentV2QuizSummary[],
  topicId: string,
): ContentV2QuizSummary[] {
  return quizzes
    .filter(
      (quiz) =>
        quiz.topicId === topicId &&
        quiz.questionCount === quiz.reviewedQuestionCount,
    )
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

export function shouldPublishContainingTopic(topicExists: boolean): boolean {
  return !topicExists;
}
