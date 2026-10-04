import assert from "node:assert/strict";
import test from "node:test";
import { releaseCommands } from "../src/features/deployment/main/full-release-jobs.js";

test("staging release deploys the complete Web target before store uploads", () => {
  assert.deepEqual(releaseCommands("staging", "all"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"], steps: 7 },
    { label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"], steps: 1 },
    { label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"], steps: 1 },
  ]);
});

test("production release creates the Android production draft last", () => {
  assert.deepEqual(releaseCommands("production", "all"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:production"], steps: 7 },
    { label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "production"], steps: 1 },
    { label: "Uploading Android production draft", args: ["run", "native:deploy:android", "--", "production"], steps: 1 },
  ]);
});

test("individual native releases deploy Web and Firebase dependencies first", () => {
  assert.deepEqual(releaseCommands("staging", "ios"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"], steps: 7 },
    { label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"], steps: 1 },
  ]);
  assert.deepEqual(releaseCommands("staging", "android"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"], steps: 7 },
    { label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"], steps: 1 },
  ]);
  assert.deepEqual(releaseCommands("production", "web"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:production"], steps: 7 },
  ]);
});
