import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cleanDeploymentLogLine, shouldWaitForFirestoreIndexes } from "../src/features/deployment/main/web-deployment-jobs.js";

const source = readFileSync(new URL("../src/features/deployment/main/web-deployment-jobs.ts", import.meta.url), "utf8");
const deployScript = readFileSync(new URL("../scripts/deployment/deploy-web.mjs", import.meta.url), "utf8");

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

test("Firebase deployment hashes stay in the Tools Git project", () => {
  assert.doesNotMatch(source, /GETGO_DEPLOY_STATE_ROOT/);
  assert.doesNotMatch(deployScript, /GETGO_DEPLOY_STATE_ROOT/);
  assert.match(deployScript, /const stateRoot = join\(toolsRoot, '\.state'\)/);
});

test("function planning and status use per-export hashes instead of whole-codebase hashes", () => {
  assert.doesNotMatch(deployScript, /digest\.update\(hashDir\(join\(codebase\.dir, 'vendor'\)\)\)/);
  assert.doesNotMatch(deployScript, /hashChanged\(`functions:\$\{codebase\.name \?\? 'default'\}`\)/);
  assert.match(source, /function-deploy-hashes\.mjs/);
  assert.match(source, /`functions:\$\{codebase\}:\$\{name\}`/);
});
