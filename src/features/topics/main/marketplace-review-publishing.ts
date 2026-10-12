import type { MarketplaceTopicReviewBackup } from "../domain/marketplace-reviews.js";

type FirestoreValue = Record<string, unknown>;
type FirestoreWrite = Record<string, unknown>;
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };

const value = (item: string | number): FirestoreValue => typeof item === "number"
  ? { integerValue: String(item) }
  : { stringValue: item };

function sameTimestamp(left: unknown, right: string): boolean {
  if (typeof left !== "string") return false;
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && leftTime === rightTime;
}

export async function publishMarketplaceTopicReviews(
  topicId: string,
  reviews: MarketplaceTopicReviewBackup[],
  commit: (writes: FirestoreWrite[]) => Promise<void>,
  listDocuments: (parentPath: string, collectionId: string) => Promise<FirestoreDocument[]>,
): Promise<void> {
  const parentPath = `/getgo-marketplace-topics/${encodeURIComponent(topicId)}`;
  const writes = reviews.map((review) => ({ update: {
    name: "",
    relativeName: `${parentPath}/reviews/${encodeURIComponent(review.id)}`,
    fields: {
      parentId: value(review.id),
      topicId: value(topicId),
      authorName: value(review.authorName),
      rating: value(review.rating),
      comment: value(review.comment),
      createdAt: { timestampValue: review.createdAt },
      updatedAt: { timestampValue: review.createdAt },
    },
  } }));
  for (let offset = 0; offset < writes.length; offset += 450)
    await commit(writes.slice(offset, offset + 450));

  const remoteById = new Map((await listDocuments(parentPath, "reviews"))
    .map((document) => [decodeURIComponent(document.name.split("/").at(-1)!), document]));
  const incomplete = reviews.filter((review) => {
    const fields = remoteById.get(review.id)?.fields;
    return fields?.parentId?.stringValue !== review.id
      || fields?.topicId?.stringValue !== topicId
      || fields?.authorName?.stringValue !== review.authorName
      || Number(fields?.rating?.integerValue) !== review.rating
      || fields?.comment?.stringValue !== review.comment
      || !sameTimestamp(fields?.updatedAt?.timestampValue, review.createdAt);
  });
  if (incomplete.length)
    throw new Error(`Marketplace topic ${topicId} has missing or incomplete restored reviews: ${incomplete.map((review) => review.id).join(", ")}.`);
}
