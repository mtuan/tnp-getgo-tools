import type { ContentV2QuestionSummary } from "../../../shared/domain/models.js";

export function aiGeneratedQuizKeys(questions: ContentV2QuestionSummary[]) {
  const keys = new Set<string>();
  for (const question of questions) {
    if (question.aiGenerated) keys.add(`${question.topicId}/${question.quizId}`);
  }
  return keys;
}
