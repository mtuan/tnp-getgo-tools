import type { RepositorySnapshot } from "../../../shared/domain/models.js";
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
  snapshot,
  target,
  ids,
  state,
  topicId,
}: {
  root: string;
  snapshot: RepositorySnapshot;
  target: BatchTarget;
  ids: string[];
  state: MarketplaceTopicState;
  topicId?: string;
}): Promise<RepositorySnapshot> {
  const requested = new Set(ids);
  if (target === "topics") {
    const saved = await Promise.all(
      snapshot.contentV2.topics
        .filter((summary) => requested.has(summary.id))
        .map(async (summary) => {
          const topic = await loadContentV2Topic(root, summary.id);
          if (state === "listed" && marketplaceTopicState(topic.marketplace) !== "unlisted") return null;
          return saveContentV2Topic(root, {
            ...topic,
            marketplace: withMarketplaceTopicState(topic.marketplace, state),
          });
        }),
    );
    const byId = new Map(saved.filter(Boolean).map((topic) => [topic!.id, topic!]));
    return {
      ...snapshot,
      contentV2: {
        ...snapshot.contentV2,
        topics: snapshot.contentV2.topics.map((summary) => {
          const topic = byId.get(summary.id);
          return topic ? {
            ...summary,
            marketplace: topic.marketplace,
            marketplaceLocalHash: hashContentV2(sanitizeMarketplaceTopic(topic)),
          } : summary;
        }),
      },
    };
  }

  if (!topicId) throw new Error("A topic ID is required for quiz updates.");
  const parent = await loadContentV2Topic(root, topicId);
  const saved = await Promise.all(
    snapshot.contentV2.quizzes
      .filter((summary) => summary.topicId === topicId && requested.has(summary.id))
      .map(async (summary) => {
        const quiz = await loadContentV2Quiz(root, topicId, summary.id);
        if (state === "listed" && marketplaceTopicState(quiz.marketplace) !== "unlisted") return null;
        const marketplace = withMarketplaceTopicState(quiz.marketplace, state);
        await saveContentV2Quiz(root, parent, { ...quiz, marketplace });
        return { id: quiz.id, marketplace };
      }),
  );
  const byId = new Map(saved.filter(Boolean).map((quiz) => [quiz!.id, quiz!.marketplace]));
  return {
    ...snapshot,
    contentV2: {
      ...snapshot.contentV2,
      quizzes: snapshot.contentV2.quizzes.map((summary) =>
        summary.topicId === topicId && byId.has(summary.id)
          ? { ...summary, marketplace: byId.get(summary.id) }
          : summary,
      ),
    },
  };
}
