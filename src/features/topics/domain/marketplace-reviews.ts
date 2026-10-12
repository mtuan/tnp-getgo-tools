export interface MarketplaceTopicReviewBackup {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

const reviewIdPattern = /^[A-Za-z0-9_-]+$/;

export function parseMarketplaceTopicReviewBackups(
  value: unknown,
): MarketplaceTopicReviewBackup[] {
  if (!Array.isArray(value)) throw new Error("reviews.json must contain an array.");
  const seen = new Set<string>();
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`Review ${index + 1} must be an object.`);
    const review = item as Record<string, unknown>;
    const id = typeof review.id === "string" ? review.id.trim() : "";
    const authorName = typeof review.authorName === "string" ? review.authorName.trim() : "";
    const comment = typeof review.comment === "string" ? review.comment : "";
    const rating = review.rating;
    const createdAt = typeof review.createdAt === "string" ? review.createdAt : "";
    if (!reviewIdPattern.test(id)) throw new Error(`Review ${index + 1} has an invalid ID.`);
    if (seen.has(id)) throw new Error(`reviews.json contains duplicate review ID “${id}”.`);
    if (!authorName) throw new Error(`Review “${id}” must have an author name.`);
    if (!Number.isInteger(rating) || Number(rating) < 1 || Number(rating) > 5)
      throw new Error(`Review “${id}” must have a whole-number rating from 1 to 5.`);
    if (comment.length > 2_000) throw new Error(`Review “${id}” has a comment longer than 2,000 characters.`);
    if (!createdAt || !Number.isFinite(new Date(createdAt).getTime()))
      throw new Error(`Review “${id}” must have a valid createdAt timestamp.`);
    seen.add(id);
    return { id, authorName, rating: Number(rating), comment, createdAt: new Date(createdAt).toISOString() };
  });
}
