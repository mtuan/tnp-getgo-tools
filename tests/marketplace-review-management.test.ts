import assert from "node:assert/strict";
import test from "node:test";
import type { FirebaseAuthService } from "../src/features/authentication/main/firebase-auth.js";
import { clearMarketplaceTopicReviews, listMarketplaceTopicReviews } from "../src/features/topics/main/marketplace-review-management.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("lists a cursor-backed page of topic reviews", async () => {
  const calls: string[] = [];
  const auth = { firestoreRequest: async (requestPath: string) => {
    calls.push(requestPath);
    return { projectId: "demo", response: jsonResponse({ documents: [{
      name: "projects/demo/databases/(default)/documents/getgo-marketplace-topics/timo-pr-3/reviews/review-1",
      fields: {
        authorName: { stringValue: "Tuan" }, rating: { integerValue: "5" },
        comment: { stringValue: "Great" }, createdAt: { timestampValue: "2026-10-13T00:00:00.000Z" },
        updatedAt: { timestampValue: "2026-10-13T01:00:00.000Z" },
      },
    }], nextPageToken: "next" }) };
  } } as unknown as FirebaseAuthService;

  const result = await listMarketplaceTopicReviews(auth, { topicId: "timo-pr-3", pageSize: 20 });

  assert.equal(result.items[0]?.id, "review-1");
  assert.equal(result.items[0]?.rating, 5);
  assert.equal(result.nextCursor, "next");
  assert.match(calls[0]!, /pageSize=20/);
  assert.match(calls[0]!, /orderBy=createdAt\+desc/);
});

test("clears all review documents in batches", async () => {
  const commits: unknown[] = [];
  let listPage = 0;
  const auth = { firestoreRequest: async (requestPath: string, init?: RequestInit) => {
    if (requestPath === ":commit") {
      commits.push(JSON.parse(String(init?.body)));
      return { projectId: "demo", response: jsonResponse({}) };
    }
    listPage += 1;
    return { projectId: "demo", response: jsonResponse({
      documents: [{ name: `projects/demo/databases/(default)/documents/topics/x/reviews/r${listPage}` }],
      ...(listPage === 1 ? { nextPageToken: "page-2" } : {}),
    }) };
  } } as unknown as FirebaseAuthService;

  const result = await clearMarketplaceTopicReviews(auth, "timo-pr-3");

  assert.deepEqual(result, { deleted: 2 });
  assert.equal(commits.length, 1);
  assert.equal((commits[0] as { writes: unknown[] }).writes.length, 2);
});
