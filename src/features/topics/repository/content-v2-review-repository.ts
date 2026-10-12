import { promises as fs } from "node:fs";
import path from "node:path";
import { contentTopicsRoot } from "./content-source.js";
import {
  parseMarketplaceTopicReviewBackups,
  type MarketplaceTopicReviewBackup,
} from "../domain/marketplace-reviews.js";

const topicIdPattern = /^[a-z][a-z0-9_-]*$/;

export async function loadContentV2TopicReviews(
  repositoryPath: string,
  topicId: string,
): Promise<MarketplaceTopicReviewBackup[]> {
  if (!topicIdPattern.test(topicId)) throw new Error("Invalid topic ID.");
  const filePath = path.join(contentTopicsRoot(repositoryPath), topicId, "reviews.json");
  try {
    return parseMarketplaceTopicReviewBackups(
      JSON.parse(await fs.readFile(filePath, "utf8")),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
