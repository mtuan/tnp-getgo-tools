import assert from "node:assert/strict";
import test from "node:test";
import { fullReleaseCommands } from "../src/features/deployment/main/full-release-jobs.js";

test("staging release deploys the complete Web target before store uploads", () => {
  assert.deepEqual(fullReleaseCommands("staging"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:staging"] },
    { label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "staging"] },
    { label: "Uploading Android to Internal testing", args: ["run", "native:deploy:android", "--", "staging"] },
  ]);
});

test("production release creates the Android production draft last", () => {
  assert.deepEqual(fullReleaseCommands("production"), [
    { label: "Deploying Web and Firebase", args: ["run", "deploy:getgo:production"] },
    { label: "Uploading iOS to TestFlight", args: ["run", "native:deploy:ios", "--", "production"] },
    { label: "Uploading Android production draft", args: ["run", "native:deploy:android", "--", "production"] },
  ]);
});
