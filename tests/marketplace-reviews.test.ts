import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseMarketplaceTopicReviewBackups } from "../src/features/topics/domain/marketplace-reviews.js";
import { loadContentV2TopicReviews } from "../src/features/topics/repository/content-v2-review-repository.js";
import { publishMarketplaceTopicReviews } from "../src/features/topics/main/marketplace-review-publishing.js";

test("loads topic review backups and normalizes their timestamps", async (context) => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-topic-reviews-"));
  context.after(() => fs.rm(repository, { recursive: true, force: true }));
  const topicDirectory = path.join(repository, "content-v2", "topics", "sample-topic");
  await fs.mkdir(topicDirectory, { recursive: true });
  await fs.writeFile(path.join(topicDirectory, "reviews.json"), JSON.stringify([{
    id: "review-1",
    authorName: " Parent ",
    rating: 5,
    comment: "Helpful",
    createdAt: "2026-10-01T10:00:00Z",
  }]));

  assert.deepEqual(await loadContentV2TopicReviews(repository, "sample-topic"), [{
    id: "review-1",
    authorName: "Parent",
    rating: 5,
    comment: "Helpful",
    createdAt: "2026-10-01T10:00:00.000Z",
  }]);
});

test("a topic without reviews.json has no review backups", async (context) => {
  const repository = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-topic-reviews-"));
  context.after(() => fs.rm(repository, { recursive: true, force: true }));
  await fs.mkdir(path.join(repository, "content-v2", "topics", "sample-topic"), { recursive: true });

  assert.deepEqual(await loadContentV2TopicReviews(repository, "sample-topic"), []);
});

test("rejects duplicate review IDs and invalid review data", () => {
  const review = { id: "review-1", authorName: "Parent", rating: 5, comment: "", createdAt: "2026-10-01T10:00:00Z" };
  assert.throws(() => parseMarketplaceTopicReviewBackups([review, review]), /duplicate review ID/);
  assert.throws(() => parseMarketplaceTopicReviewBackups([{ ...review, rating: 6 }]), /rating from 1 to 5/);
  assert.throws(() => parseMarketplaceTopicReviewBackups([{ ...review, createdAt: "invalid" }]), /valid createdAt/);
});

test("publishes and verifies review backups by stable document ID", async () => {
  const batches: Array<Array<Record<string, unknown>>> = [];
  await publishMarketplaceTopicReviews("sample-topic", [{
    id: "review-1",
    authorName: "Parent",
    rating: 5,
    comment: "Helpful",
    createdAt: "2026-10-01T10:00:00.000Z",
  }], async (writes) => { batches.push(writes); }, async () => [{
    name: "projects/project/databases/(default)/documents/getgo-marketplace-topics/sample-topic/reviews/review-1",
    fields: {
      parentId: { stringValue: "review-1" },
      topicId: { stringValue: "sample-topic" },
      authorName: { stringValue: "Parent" },
      rating: { integerValue: "5" },
      comment: { stringValue: "Helpful" },
      updatedAt: { timestampValue: "2026-10-01T10:00:00Z" },
    },
  }]);

  const update = batches[0]?.[0]?.update as { relativeName: string; fields: Record<string, Record<string, unknown>> };
  assert.equal(update.relativeName, "/getgo-marketplace-topics/sample-topic/reviews/review-1");
  assert.deepEqual(update.fields.rating, { integerValue: "5" });
  assert.deepEqual(update.fields.updatedAt, { timestampValue: "2026-10-01T10:00:00.000Z" });
});

test("fails synchronization when a backed-up review is still missing remotely", async () => {
  await assert.rejects(
    publishMarketplaceTopicReviews("sample-topic", [{
      id: "review-1",
      authorName: "Parent",
      rating: 5,
      comment: "",
      createdAt: "2026-10-01T10:00:00.000Z",
    }], async () => {}, async () => []),
    /missing or incomplete restored reviews: review-1/,
  );
});
