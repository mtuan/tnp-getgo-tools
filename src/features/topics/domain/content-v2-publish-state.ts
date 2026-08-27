import type { ContentV2QuizPublishPreview } from "../../../shared/domain/models.js";
import { hashContentV2 } from "./content-v2.js";

const FIRESTORE_PUBLISH_CONTRACT_VERSION = 2;

export interface ContentV2PublishedItem {
  kind: "firestore-document" | "storage-object";
  path: string;
  hash: string;
}

export interface ContentV2PublishTargetState {
  publishContractVersion?: number;
  environment: string;
  projectId: string;
  contentHash: string;
  publishedAt: string;
  items: Record<string, ContentV2PublishedItem>;
}

export interface ContentV2QuizPublishState {
  schemaVersion: 1;
  targets: Record<string, ContentV2PublishTargetState>;
}

export interface ContentV2TopicPublishTargetState {
  environment: string;
  projectId: string;
  contentHash: string | null;
  marketplaceContentHash: string | null;
  publishedAt: string;
}

export interface ContentV2TopicPublishState {
  schemaVersion: 1;
  targets: Record<string, ContentV2TopicPublishTargetState>;
}

export function publishedItemKey(item: Pick<ContentV2PublishedItem, "kind" | "path">): string {
  return `${item.kind}:${item.path}`;
}

export function contentV2PublishedItems(
  preview: ContentV2QuizPublishPreview,
): Record<string, ContentV2PublishedItem> {
  const firestore = [
    preview.firestore.marketplaceQuizDocument,
    preview.firestore.quizDocument,
    ...preview.firestore.questionDocuments,
    ...preview.firestore.resourceDocuments,
  ].map((document) => {
    const data = { ...document.data };
    if (data.publishedAt === "<generated at publish time>") delete data.publishedAt;
    return {
      kind: "firestore-document" as const,
      path: document.path,
      hash: hashContentV2({
        publishContractVersion: FIRESTORE_PUBLISH_CONTRACT_VERSION,
        data,
      }),
    };
  });
  const storage = preview.firebaseStorage.uploads.map((upload) => ({
    kind: "storage-object" as const,
    path: upload.destinationPath,
    hash: upload.contentHash,
  }));
  return Object.fromEntries(
    [...firestore, ...storage].map((item) => [publishedItemKey(item), item]),
  );
}

export function diffContentV2PublishedItems(
  previous: Record<string, ContentV2PublishedItem> | undefined,
  current: Record<string, ContentV2PublishedItem>,
): { changed: Set<string>; removed: ContentV2PublishedItem[] } {
  const changed = new Set(
    Object.entries(current)
      .filter(([key, item]) => previous?.[key]?.hash !== item.hash)
      .map(([key]) => key),
  );
  const removed = Object.entries(previous ?? {})
    .filter(([key]) => !current[key])
    .map(([, item]) => item);
  return { changed, removed };
}
