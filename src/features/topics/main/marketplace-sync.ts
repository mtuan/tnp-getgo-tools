import {
  marketplaceTopicStates,
  type ContentV2Topic,
  type MarketplaceTopicMetadataInput,
  type MarketplaceTopicState,
} from "../../../features/topics/domain/content-v2.js";
import type { FirestorePublishingService } from "./firestore-publishing.js";

export async function syncMarketplaceTopic(
  publishing: FirestorePublishingService,
  topic: ContentV2Topic,
  contentHash: string,
  state: MarketplaceTopicState,
) {
  if (state !== "removed")
    return publishing.publishMarketplaceTopic(topic, contentHash);
  await publishing.removeMarketplaceTopic(topic.id);
  return {
    kind: "topic" as const,
    topicId: topic.id,
    contentHash,
    publishedAt: new Date().toISOString(),
  };
}

export function parseMarketplaceTopicState(value: unknown): MarketplaceTopicState {
  if (typeof value === "string" && marketplaceTopicStates.includes(value as MarketplaceTopicState))
    return value as MarketplaceTopicState;
  throw new Error("Invalid marketplace listing state.");
}

export function syncedMarketplaceMetadata(
  metadata: MarketplaceTopicMetadataInput | undefined,
  state: MarketplaceTopicState,
  result: { contentHash: string; publishedAt: string },
): MarketplaceTopicMetadataInput {
  return {
    ...metadata,
    publishedHash: state === "removed" ? undefined : result.contentHash,
    publishedAt: state === "removed" ? undefined : result.publishedAt,
  };
}
