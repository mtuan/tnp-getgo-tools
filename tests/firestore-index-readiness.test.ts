import assert from "node:assert/strict";
import test from "node:test";
import { inspectFirestoreIndexReadiness } from "../src/features/deployment/main/firestore-index-readiness.js";

const required = [
  {
    collectionGroup: "tests",
    queryScope: "COLLECTION" as const,
    fields: [
      { fieldPath: "status", order: "ASCENDING" as const },
      { fieldPath: "updatedAt", order: "DESCENDING" as const },
    ],
  },
  {
    collectionGroup: "starEntries",
    queryScope: "COLLECTION" as const,
    fields: [
      { fieldPath: "stars", order: "DESCENDING" as const },
      { fieldPath: "studentName", order: "ASCENDING" as const },
    ],
  },
];

test("matches deployed indexes while ignoring Firestore's generated __name__ field", () => {
  const result = inspectFirestoreIndexReadiness(required, [
    {
      name: "projects/example/databases/(default)/collectionGroups/tests/indexes/one",
      queryScope: "COLLECTION",
      state: "CREATING",
      fields: [
        { fieldPath: "status", order: "ASCENDING" },
        { fieldPath: "updatedAt", order: "DESCENDING" },
        { fieldPath: "__name__", order: "DESCENDING" },
      ],
    },
    {
      name: "projects/example/databases/(default)/collectionGroups/starEntries/indexes/two",
      queryScope: "COLLECTION",
      state: "READY",
      fields: [
        { fieldPath: "stars", order: "DESCENDING" },
        { fieldPath: "studentName", order: "ASCENDING" },
        { fieldPath: "__name__", order: "ASCENDING" },
      ],
    },
  ]);

  assert.deepEqual(result, {
    ready: 1,
    total: 2,
    pending: [{ collectionGroup: "tests", state: "CREATING" }],
  });
});

test("reports required indexes missing from the remote project", () => {
  assert.deepEqual(inspectFirestoreIndexReadiness(required, []), {
    ready: 0,
    total: 2,
    pending: [
      { collectionGroup: "tests", state: "NOT_FOUND" },
      { collectionGroup: "starEntries", state: "NOT_FOUND" },
    ],
  });
});
