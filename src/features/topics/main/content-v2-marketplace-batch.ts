import type { MarketplaceStateUpdateResult } from "../../../shared/domain/models.js";
import {
  hashContentV2,
  marketplaceTopicState,
  sanitizeMarketplaceTopic,
  withMarketplaceTopicState,
  type MarketplaceTopicState,
} from "../../../features/topics/domain/content-v2.js";
import {
  loadContentV2Quiz,
  loadContentV2Topic,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../repository/content-v2-repository.js";

type BatchTarget = "topics" | "quizzes";

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
