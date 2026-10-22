import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { archivedWebDeploymentSteps, parseDeployResult, releaseCommands } from "../src/features/deployment/main/full-release-jobs.js";

const source = readFileSync(new URL("../src/features/deployment/main/full-release-jobs.ts", import.meta.url), "utf8");

test("archived Web deployments expose detailed progress tasks", () => {
  assert.equal(archivedWebDeploymentSteps, 8);
});

test("immutable Web builds expose structured task progress", () => {
  assert.match(source, /Validate source and build application/);
  assert.match(source, /Assemble Web and Firebase payload/);
  assert.match(source, /Create and verify immutable archive/);
  assert.match(source, /report:\s*\{[\s\S]*?steps: createWebReleaseBuildSteps\(\)/);
  assert.match(source, /advanceWebReleaseBuildReport\(job, progress\.completed/);
  assert.match(source, /finishWebReleaseBuildReport\(job, "failed"\)/);
  assert.match(source, /finishWebReleaseBuildReport\(job, "cancelled"\)/);
});

test("staging release deploys the complete Web target before store uploads", () => {
  assert.deepEqual(releaseCommands("staging", "all"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "release:web:staging"], steps: 7 },
    { stage: "ios", label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"], steps: 1 },
    { stage: "android", label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"], steps: 1 },
  ]);
});

test("production release creates the Android production draft last", () => {
  assert.deepEqual(releaseCommands("production", "all"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "release:web:production"], steps: 7 },
    { stage: "ios", label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "production"], steps: 1 },
    { stage: "android", label: "Uploading Android production draft", args: ["run", "native:deploy:android", "--", "production"], steps: 1 },
  ]);
});

test("individual native releases deploy Web and Firebase dependencies first", () => {
  assert.deepEqual(releaseCommands("staging", "ios"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "release:web:staging"], steps: 7 },
    { stage: "ios", label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"], steps: 1 },
  ]);
  assert.deepEqual(releaseCommands("staging", "android"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "release:web:staging"], steps: 7 },
    { stage: "android", label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"], steps: 1 },
  ]);
  assert.deepEqual(releaseCommands("production", "web"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "release:web:production"], steps: 7 },
  ]);
});

test("deployment result distinguishes a real publish from an up-to-date no-op", () => {
  assert.equal(parseDeployResult('GETGO_DEPLOY_RESULT {"outcome":"deployed","deployed":["hosting"]}'), "deployed");
  assert.equal(parseDeployResult('GETGO_DEPLOY_RESULT {"outcome":"up-to-date","deployed":[]}'), "up-to-date");
  assert.equal(parseDeployResult('GETGO_DEPLOY_RESULT {"outcome":"warning","deployed":[]}'), "warning");
  assert.equal(parseDeployResult("GETGO_RELEASE_PROGRESS {}"), null);
  assert.equal(parseDeployResult("GETGO_DEPLOY_RESULT not-json"), null);
});

test("full releases share the Tools Git-project deployment baseline", () => {
  assert.doesNotMatch(source, /GETGO_DEPLOY_STATE_ROOT/);
});
