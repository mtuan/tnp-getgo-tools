import { hashContentV2, marketplaceTopicState, sanitizeMarketplaceTopic } from "../core/content-v2.js";
import type { RepositorySnapshot } from "../core/models.js";
import { loadContentV2Topic, saveContentV2Topic } from "../repositories/content-v2-repository.js";
import type { FirestorePublishingService } from "./firestore-publishing.js";
import { syncMarketplaceTopic, syncedMarketplaceMetadata } from "./marketplace-sync.js";
import type { PublishJobControl } from "./publish-jobs.js";

export async function syncAllMarketplaceTopics(
  root: string,
  snapshot: RepositorySnapshot,
  publishing: FirestorePublishingService,
  control: PublishJobControl,
): Promise<RepositorySnapshot> {
  const candidates = snapshot.contentV2.topics.filter((topic) => {
    const state = marketplaceTopicState(topic.marketplace);
    return state === "removed"
      ? Boolean(topic.marketplacePublishedHash)
      : topic.marketplaceLocalHash !== topic.marketplacePublishedHash;
  });
  await control.setTotal(candidates.length, "Preparing marketplace sync");
  let next = snapshot;
  for (const summary of candidates) {
    await control.checkpoint();
    const topic = await loadContentV2Topic(root, summary.id);
    const state = marketplaceTopicState(topic.marketplace);
    if (state !== "removed") {
      if (!summary.publishedAt) throw new Error(`Publish "${summary.title}" before marketplace sync.`);
      if (!(await publishing.contentV2TopicExists(summary.id)))
        throw new Error(`Topic "${summary.title}" is not published in this environment.`);
    }
    const contentHash = hashContentV2(sanitizeMarketplaceTopic(topic));
    const result = await syncMarketplaceTopic(publishing, topic, contentHash, state);
    const marketplace = syncedMarketplaceMetadata(topic.marketplace, state, result);
    await saveContentV2Topic(root, { ...topic, marketplace });
    next = {
      ...next,
      contentV2: {
        ...next.contentV2,
        topics: next.contentV2.topics.map((item) => item.id === summary.id ? {
          ...item, marketplace, marketplaceLocalHash: contentHash,
          marketplacePublishedHash: state === "removed" ? null : result.contentHash,
          marketplacePublishedAt: state === "removed" ? null : result.publishedAt,
        } : item),
      },
    };
    await control.advance(`Synchronized ${summary.title}`);
  }
  return next;
}
