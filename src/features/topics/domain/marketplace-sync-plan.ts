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
    const changedQuizzes = topicQuizzes.filter((quiz) => {
      const state = marketplaceTopicState(quiz.marketplace);
      return state === "removed"
        ? Boolean(quiz.publishedHash)
        : changed(quiz.localHash, quiz.publishedHash);
    });
    const marketState = marketplaceTopicState(topic.marketplace);
    const topicChanged = changed(topic.localHash, topic.publishedHash) ||
      (marketState === "removed"
        ? Boolean(topic.marketplacePublishedHash)
        : changed(topic.marketplaceLocalHash, topic.marketplacePublishedHash));
    if (topicChanged || changedQuizzes.length) {
      items.push({
        kind: "topic",
        topic,
        action: marketState === "removed"
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
        action: state === "removed"
          ? "remove"
          : quiz.publishedHash ? "update" : "create",
        ready: state === "removed" ||
          (quiz.questionCount > 0 && quiz.questionCount === quiz.reviewedQuestionCount),
      });
    }
  }
  return items;
}
