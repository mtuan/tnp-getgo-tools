import type {
  ContentV2QuizSummary,
  ContentV2TopicSummary,
} from "../../../../shared/domain/models";

const labels = {
  competition: "Contest",
  "kid-learning": "Kids learning",
  "competition-paper": "Contest",
  alphabet: "Alphabet",
  spelling: "Spelling",
  pronunciation: "Pronunciation",
} as const;

export function topicTypeLabel(type: ContentV2TopicSummary["type"]): string {
  return labels[type];
}

export function quizTypeLabel(type: ContentV2QuizSummary["type"]): string {
  return labels[type];
}
