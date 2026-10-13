import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { MarketplaceTopicReview, MarketplaceTopicReviewPage } from "../domain/marketplace-reviews.js";

type FirestoreValue = { stringValue?: string; integerValue?: string; timestampValue?: string };
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };
const topicIdPattern = /^[a-z][a-z0-9-]*$/;

function requireTopicId(value: unknown): string {
  if (typeof value !== "string" || !topicIdPattern.test(value)) throw new Error("Invalid topic ID.");
  return value;
}

function requirePageSize(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100)
    throw new Error("Review page size must be from 1 to 100.");
  return Number(value);
}

async function responseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
  return new Error(payload.error?.message ?? `Firestore returned HTTP ${response.status}.`);
}

function reviewFromDocument(document: FirestoreDocument): MarketplaceTopicReview {
  const fields = document.fields ?? {};
  const id = decodeURIComponent(document.name.split("/").at(-1) ?? "");
  const authorName = fields.authorName?.stringValue ?? "";
  const rating = Number(fields.rating?.integerValue);
  const comment = fields.comment?.stringValue ?? "";
  const createdAt = fields.createdAt?.timestampValue ?? "";
  const updatedAt = fields.updatedAt?.timestampValue ?? createdAt;
  if (!id || !authorName || !Number.isInteger(rating) || rating < 1 || rating > 5 || !createdAt)
    throw new Error(`Review “${id || "unknown"}” has invalid Firestore data.`);
  return { id, authorName, rating, comment, createdAt, updatedAt };
}

export async function listMarketplaceTopicReviews(
  auth: FirebaseAuthService,
  input: { topicId: unknown; pageSize: unknown; cursor?: unknown },
): Promise<MarketplaceTopicReviewPage> {
  const topicId = requireTopicId(input.topicId);
  const pageSize = requirePageSize(input.pageSize);
  if (input.cursor != null && typeof input.cursor !== "string") throw new Error("Invalid review page cursor.");
  const query = new URLSearchParams({ pageSize: String(pageSize), orderBy: "createdAt desc", ...(input.cursor ? { pageToken: input.cursor } : {}) });
  const { response } = await auth.firestoreRequest(`/getgo-marketplace-topics/${encodeURIComponent(topicId)}/reviews?${query}`);
  if (response.status === 404) return { items: [], nextCursor: null };
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
  return { items: (payload.documents ?? []).map(reviewFromDocument), nextCursor: payload.nextPageToken || null };
}

export async function clearMarketplaceTopicReviews(
  auth: FirebaseAuthService,
  topicIdValue: unknown,
): Promise<{ deleted: number }> {
  const topicId = requireTopicId(topicIdValue);
  const names: string[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ pageSize: "300", ...(cursor ? { pageToken: cursor } : {}) });
    const { response } = await auth.firestoreRequest(`/getgo-marketplace-topics/${encodeURIComponent(topicId)}/reviews?${query}`);
    if (response.status === 404) break;
    if (!response.ok) throw await responseError(response);
    const payload = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    names.push(...(payload.documents ?? []).map((document) => document.name));
    cursor = payload.nextPageToken || null;
  } while (cursor);
  for (let offset = 0; offset < names.length; offset += 450) {
    const { response } = await auth.firestoreRequest(":commit", {
      method: "POST",
      body: JSON.stringify({ writes: names.slice(offset, offset + 450).map((name) => ({ delete: name })) }),
    });
    if (!response.ok) throw await responseError(response);
  }
  return { deleted: names.length };
}
