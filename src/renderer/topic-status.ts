import type { ContentV2TopicSummary, QuizSummary } from "../shared/domain/models";
import { marketplaceTopicState, type MarketplaceTopicState } from "../features/topics/domain/marketplace-topic-state";
import type { StatusBadgeTone } from "../shared/ui/StatusBadge";

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

export function marketplaceStateLabel(metadata?: QuizSummary["marketplace"]): {
  state: MarketplaceTopicState;
  label: string;
} {
  const state = marketplaceTopicState(metadata);
  return { state, label: state[0].toUpperCase() + state.slice(1) };
}

export function marketplaceStateTone(state: MarketplaceTopicState): StatusBadgeTone {
  if (state === "listed") return "success";
  if (state === "featured") return "primary";
  if (state === "removed") return "danger";
  return "neutral";
}

export function quizMarketplaceStatus(quiz: QuizSummary): TopicStatus {
  if (!quiz.publishedHash) return { kind: "none", label: "Needs sync" };
  return quiz.publishedHash === quiz.localContentHash
    ? { kind: "current", label: "Up to date" }
    : { kind: "changed", label: "Needs sync" };
}

export function topicMarketplaceSyncStatus(topic: ContentV2TopicSummary): TopicStatus {
  if (marketplaceTopicState(topic.marketplace) === "removed" && !topic.marketplacePublishedHash)
    return { kind: "current", label: "Up to date" };
  if (!topic.marketplacePublishedHash) return { kind: "none", label: "Needs sync" };
  return topic.marketplacePublishedHash === topic.marketplaceLocalHash
    ? { kind: "current", label: "Up to date" }
    : { kind: "changed", label: "Needs sync" };
}
