import assert from "node:assert/strict";
import test from "node:test";
import { deploymentTargetFromRoute, deploymentTargets, otherToolsNavigation, primaryNavigation, settingsNavigation } from "../src/app/renderer/navigation";

test("sidebar exposes Development and Deploy as separate root pages", () => {
  assert.deepEqual(deploymentTargets, ["staging", "production"]);
  assert.deepEqual(primaryNavigation.map((item) => item.id), ["development", "deploy", "jobs", "topics", "feedbacks", "payments"]);
  assert.equal(deploymentTargetFromRoute("/deploy/development"), null);
  assert.equal(deploymentTargetFromRoute("/deploy/staging?section=doctor"), "staging");
  assert.equal(deploymentTargetFromRoute("/deploy/production/"), "production");
  assert.equal(deploymentTargetFromRoute("/deploy"), null);
  assert.equal(deploymentTargetFromRoute("/deploy/unknown"), null);
});

test("sidebar groups secondary tools and keeps Settings last", () => {
  assert.deepEqual(otherToolsNavigation.map((item) => item.id), [
    "amc-import",
    "image-pdf",
    "screenshots",
    "avatar-sets",
    "access",
    "members",
    "safe-words",
  ]);
  assert.deepEqual(settingsNavigation.map((item) => item.id), ["settings"]);
  assert.equal(new Set([...primaryNavigation, ...otherToolsNavigation, ...settingsNavigation].map((item) => item.id)).size, 14);
});
