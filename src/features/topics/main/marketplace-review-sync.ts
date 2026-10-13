import { marketplaceTopicState } from "../domain/marketplace-topic-state.js";
import { loadContentV2TopicReviews } from "../repository/content-v2-review-repository.js";
import { loadContentV2TopicsOverview } from "../repository/content-v2-repository.js";
import type { FirestorePublishingService } from "./firestore-publishing.js";

export async function syncListedMarketplaceTopicReviews(
  root: string,
  publishing: FirestorePublishingService,
): Promise<{ topicCount: number; reviewCount: number }> {
  const overview = await loadContentV2TopicsOverview(root);
  const topics = overview.content.topics.filter(
    (topic) => marketplaceTopicState(topic.marketplace) !== "unlisted",
  );
  let reviewCount = 0;
  for (const topic of topics) {
    try {
      const result = await publishing.syncMarketplaceTopicReviews(
        topic.id,
        await loadContentV2TopicReviews(root, topic.id),
      );
      reviewCount += result.reviewCount;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`Could not synchronize reviews for “${topic.title}” (${topic.id}): ${message}`, { cause });
    }
  }
  return { topicCount: topics.length, reviewCount };
}
