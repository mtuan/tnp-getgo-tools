import type {
  ContentV2QuizSummary,
  ContentV2TopicSummary,
} from "../../../shared/domain/models.js";
import { marketplaceTopicState } from "./marketplace-topic-state.js";

type SyncAction = "create" | "update" | "remove";
export type MarketplaceSyncPlanItem =
  | { kind: "topic"; topic: ContentV2TopicSummary; action: SyncAction; ready: true }
  | { kind: "quiz"; topic: ContentV2TopicSummary; quiz: ContentV2QuizSummary; action: SyncAction; ready: boolean };

function changed(local: string | undefined, published: string | null | undefined) {
  return local !== published;
}

export function marketplaceSyncPlan(
  topics: ContentV2TopicSummary[],
  quizzes: ContentV2QuizSummary[] = [],
): MarketplaceSyncPlanItem[] {
  const items: MarketplaceSyncPlanItem[] = [];
  for (const topic of topics) {
    const topicQuizzes = quizzes.filter((quiz) => quiz.topicId === topic.id);
    const marketState = marketplaceTopicState(topic.marketplace);
    const changedQuizzes = topicQuizzes.filter((quiz) => {
      if (marketState === "unlisted") return Boolean(quiz.publishedHash);
      const state = marketplaceTopicState(quiz.marketplace);
      return state === "unlisted"
        ? Boolean(quiz.publishedHash)
        : changed(quiz.localHash, quiz.publishedHash);
    });
    const topicChanged = marketState === "unlisted"
      ? Boolean(topic.publishedHash || topic.marketplacePublishedHash)
      : changed(topic.localHash, topic.publishedHash) ||
        changed(topic.marketplaceLocalHash, topic.marketplacePublishedHash);
    if (topicChanged || changedQuizzes.length) {
      items.push({
        kind: "topic",
        topic,
        action: marketState === "unlisted"
          ? "remove"
          : topic.publishedHash ? "update" : "create",
        ready: true,
      });
    }
    for (const quiz of changedQuizzes) {
      const state = marketplaceTopicState(quiz.marketplace);
      items.push({
        kind: "quiz",
        topic,
        quiz,
        action: marketState === "unlisted" || state === "unlisted"
          ? "remove"
          : quiz.publishedHash ? "update" : "create",
        ready: marketState === "unlisted" || state === "unlisted" ||
          (quiz.questionCount > 0 && quiz.questionCount === quiz.reviewedQuestionCount),
      });
    }
  }
  return items;
}
