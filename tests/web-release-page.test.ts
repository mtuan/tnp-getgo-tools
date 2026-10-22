import assert from "node:assert/strict";
import test from "node:test";
import { webReleaseTabFromRoute } from "../src/features/deployment/components/web-release-route.js";

test("Web release tabs are encoded in the deploy route", () => {
  assert.equal(webReleaseTabFromRoute("/deploy?tab=builds"), "builds");
  assert.equal(webReleaseTabFromRoute("/deploy?tab=jobs"), "jobs");
  assert.equal(webReleaseTabFromRoute("/deploy"), "builds");
  assert.equal(webReleaseTabFromRoute("/deploy?tab=unknown"), "builds");
});
