import type { MarketplaceStateUpdateResult } from "../../../shared/domain/models.js";
import {
  hashContentV2,
  marketplaceTopicState,
  sanitizeMarketplaceTopic,
  withMarketplaceTopicState,
  type MarketplaceTopicState,
} from "../../../features/topics/domain/content-v2.js";
import {
  loadContentV2TopicsOverview,
  loadContentV2Quiz,
  loadContentV2Topic,
  patchContentV2QuizMarketplacePolicy,
  patchContentV2TopicMarketplacePolicy,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../repository/content-v2-repository.js";
import { marketplaceAccessPlan } from "../domain/marketplace-access-plan.js";
import type { ContentV2Snapshot, MarketplaceAccessManagementResult } from "../../../shared/domain/models.js";

type BatchTarget = "topics" | "quizzes";

export async function applyMarketplaceAccessManagement(root: string): Promise<MarketplaceAccessManagementResult> {
  const before = (await loadContentV2TopicsOverview(root)).content;
  const topics = before.topics.filter(topic => topic.marketplace?.experimental !== true);
  let topicsUpdated = 0;
  let quizzesUpdated = 0;
  for (const summary of topics) {
    if (summary.marketplace?.pricing?.type !== "subscription") {
      await patchContentV2TopicMarketplacePolicy(root, summary.id, {
        pricing: { type: "subscription", currency: "VND" },
      });
      topicsUpdated += 1;
    }
    const quizzes = before.quizzes.filter(quiz => quiz.topicId === summary.id);
    const plan = marketplaceAccessPlan(quizzes);
    const preview = new Set(plan.previewIds);
    const free = new Set(plan.freeIds);
    for (const quiz of quizzes) {
      const shouldPreview = preview.has(quiz.id);
      const shouldBeFree = free.has(quiz.id);
      const isFree = quiz.marketplace?.pricing?.type === "free";
      const inherits = quiz.marketplace?.pricing === undefined;
      if ((quiz.marketplace?.preview === true) === shouldPreview && (shouldBeFree ? isFree : inherits)) continue;
      await patchContentV2QuizMarketplacePolicy(root, summary.id, quiz.id, {
        preview: shouldPreview,
        ...(shouldBeFree
          ? { pricing: { type: "free" as const, currency: "VND" as const } }
          : { inheritPricing: true }),
      });
      quizzesUpdated += 1;
    }
  }
  const content: ContentV2Snapshot = (await loadContentV2TopicsOverview(root)).content;
  return { content, topicCount: topics.length, topicsUpdated, quizzesUpdated };
}

export async function setContentV2MarketplaceState({
  root,
  target,
  ids,
  state,
  topicId,
}: {
  root: string;
  target: BatchTarget;
  ids: string[];
  state: MarketplaceTopicState;
  topicId?: string;
}): Promise<MarketplaceStateUpdateResult> {
  const requested = [...new Set(ids)];
  if (target === "topics") {
    const saved = await Promise.all(
      requested.map(async (id) => {
          const topic = await loadContentV2Topic(root, id);
          if (marketplaceTopicState(topic.marketplace) === state) return null;
          return saveContentV2Topic(root, {
            ...topic,
            marketplace: withMarketplaceTopicState(topic.marketplace, state),
          });
        }),
    );
    return {
      target,
      records: saved.filter((topic) => topic !== null).map((topic) => ({
        id: topic.id,
        state,
        marketplace: topic.marketplace,
        marketplaceLocalHash: hashContentV2(sanitizeMarketplaceTopic(topic)),
      })),
    };
  }

  if (!topicId) throw new Error("A topic ID is required for quiz updates.");
  const parent = await loadContentV2Topic(root, topicId);
  const saved = await Promise.all(
    requested.map(async (id) => {
        const quiz = await loadContentV2Quiz(root, topicId, id);
        if (marketplaceTopicState(quiz.marketplace) === state) return null;
        const marketplace = withMarketplaceTopicState(quiz.marketplace, state);
        await saveContentV2Quiz(root, parent, { ...quiz, marketplace });
        return { id: quiz.id, marketplace };
      }),
  );
  return {
    target,
    topicId,
    records: saved.filter((quiz) => quiz !== null).map((quiz) => ({
      id: quiz.id,
      state,
      marketplace: quiz.marketplace,
    })),
  };
}
