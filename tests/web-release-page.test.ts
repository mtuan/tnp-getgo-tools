import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { webReleaseTabFromRoute } from "../src/features/deployment/components/web-release-route.js";

test("Web release tabs are encoded in the deploy route", () => {
  assert.equal(webReleaseTabFromRoute("/deploy?tab=builds"), "builds");
  assert.equal(webReleaseTabFromRoute("/deploy?tab=jobs"), "jobs");
  assert.equal(webReleaseTabFromRoute("/deploy"), "builds");
  assert.equal(webReleaseTabFromRoute("/deploy?tab=unknown"), "builds");
});

test("Web release tab changes preserve the mounted deployment page", () => {
  const appSource = readFileSync(new URL("../src/app/renderer/App.tsx", import.meta.url), "utf8");
  const deploymentPage = appSource.match(/<DeploymentPage[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(deploymentPage, /onNavigate=\{setCurrentRoute\}/);
  assert.doesNotMatch(deploymentPage, /onNavigate=\{goToRoute\}/);
});
