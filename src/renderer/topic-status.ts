import type { ContentV2TopicSummary, QuizSummary } from "../core/models";

export type TopicStatus = { kind: "none" | "current" | "changed"; label: string };

export function topicPublishStatus(topic: ContentV2TopicSummary): TopicStatus {
  if (!topic.publishedHash) return { kind: "none", label: "Not published" };
  return topic.publishedHash === topic.localHash ? { kind: "current", label: "Published" } : { kind: "changed", label: "Changes" };
}

export function topicMarketplaceStatus(topic: ContentV2TopicSummary): TopicStatus {
  if (!topic.marketplacePublishedHash) return { kind: "none", label: "Not in market" };
  return topic.marketplacePublishedHash === topic.marketplaceLocalHash ? { kind: "current", label: "In market" } : { kind: "changed", label: "Changes" };
}

export function quizPublishStatus(quiz: QuizSummary): TopicStatus {
  if (!quiz.publishedHash) return { kind: "none", label: "Not published" };
  return quiz.publishedHash === quiz.localContentHash ? { kind: "current", label: "Published" } : { kind: "changed", label: "Changes" };
}
