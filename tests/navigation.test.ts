import assert from "node:assert/strict";
import test from "node:test";
import { otherToolsNavigation, primaryNavigation, settingsNavigation } from "../src/app/renderer/navigation";

test("sidebar keeps common tools at the top level", () => {
  assert.deepEqual(primaryNavigation.map((item) => item.id), ["deploy", "jobs", "topics", "feedbacks"]);
});

test("sidebar groups secondary tools and keeps Settings last", () => {
  assert.deepEqual(otherToolsNavigation.map((item) => item.id), [
    "image-pdf",
    "screenshots",
    "avatar-sets",
    "payments",
    "members",
    "safe-words",
  ]);
  assert.deepEqual(settingsNavigation.map((item) => item.id), ["settings"]);
  assert.equal(new Set([...primaryNavigation, ...otherToolsNavigation, ...settingsNavigation].map((item) => item.id)).size, 11);
});
