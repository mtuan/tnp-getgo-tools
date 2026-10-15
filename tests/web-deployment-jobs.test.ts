import assert from "node:assert/strict";
import test from "node:test";
import { cleanDeploymentLogLine, shouldWaitForFirestoreIndexes } from "../src/features/deployment/main/web-deployment-jobs.js";

test("waits for Firestore indexes only when that resource was deployed", () => {
  assert.equal(shouldWaitForFirestoreIndexes("deploy", "firebase", new Set(["firestore:indexes"])), true);
  assert.equal(shouldWaitForFirestoreIndexes("deploy", "firebase", new Set(["functions:getgo-billing:getGoVietQrApi"])), false);
  assert.equal(shouldWaitForFirestoreIndexes("build", "firebase", new Set(["firestore:indexes"])), false);
  assert.equal(shouldWaitForFirestoreIndexes("deploy", "web", new Set(["firestore:indexes"])), false);
});

test("deployment logs redact Firebase source tokens", () => {
  assert.equal(
    cleanDeploymentLogLine('{"sourceToken":"secret-value","status":"ok"}'),
    '{"sourceToken":"[redacted]","status":"ok"}',
  );
  assert.equal(cleanDeploymentLogLine("Got source token secret-value"), "Got source token [redacted]");
});
