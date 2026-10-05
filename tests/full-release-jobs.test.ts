import assert from "node:assert/strict";
import test from "node:test";
import { parseDeployResult, releaseCommands } from "../src/features/deployment/main/full-release-jobs.js";

test("staging release deploys the complete Web target before store uploads", () => {
  assert.deepEqual(releaseCommands("staging", "all"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"], steps: 7 },
    { stage: "ios", label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"], steps: 1 },
    { stage: "android", label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"], steps: 1 },
  ]);
});

test("production release creates the Android production draft last", () => {
  assert.deepEqual(releaseCommands("production", "all"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:production"], steps: 7 },
    { stage: "ios", label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "production"], steps: 1 },
    { stage: "android", label: "Uploading Android production draft", args: ["run", "native:deploy:android", "--", "production"], steps: 1 },
  ]);
});

test("individual native releases deploy Web and Firebase dependencies first", () => {
  assert.deepEqual(releaseCommands("staging", "ios"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"], steps: 7 },
    { stage: "ios", label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"], steps: 1 },
  ]);
  assert.deepEqual(releaseCommands("staging", "android"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"], steps: 7 },
    { stage: "android", label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"], steps: 1 },
  ]);
  assert.deepEqual(releaseCommands("production", "web"), [
    { stage: "web", label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:production"], steps: 7 },
  ]);
});

test("deployment result distinguishes a real publish from an up-to-date no-op", () => {
  assert.equal(parseDeployResult('GETGO_DEPLOY_RESULT {"outcome":"deployed","deployed":["hosting"]}'), "deployed");
  assert.equal(parseDeployResult('GETGO_DEPLOY_RESULT {"outcome":"up-to-date","deployed":[]}'), "up-to-date");
  assert.equal(parseDeployResult('GETGO_DEPLOY_RESULT {"outcome":"warning","deployed":[]}'), "warning");
  assert.equal(parseDeployResult("GETGO_RELEASE_PROGRESS {}"), null);
  assert.equal(parseDeployResult("GETGO_DEPLOY_RESULT not-json"), null);
});
