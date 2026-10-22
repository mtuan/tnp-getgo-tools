import assert from "node:assert/strict";
import test from "node:test";
import type { ReleaseDoctorCheck, WebReleaseSummary } from "../src/shared/domain/models.js";
import { createWebReleaseReadiness } from "../src/features/deployment/main/web-release-readiness.js";

const release: WebReleaseSummary = {
  releaseId: "getgo-2026.10.22-abcdef",
  createdAt: "2026-10-22T00:00:00.000Z",
  gitCommit: "abcdef",
  artifactBytes: 1024,
  stagingStatus: "not-deployed",
  productionStatus: "not-deployed",
  stagingUrl: "https://staging.example.test",
  productionUrl: "https://production.example.test",
  activeStaging: false,
  activeProduction: false,
};
const environment: ReleaseDoctorCheck = {
  id: "web",
  status: "ready",
  title: "Web and Firebase",
  summary: "Ready",
  details: [],
};

test("staging readiness reports artifact and environment gates", () => {
  const result = createWebReleaseReadiness("staging", release, environment);
  assert.equal(result.ready, true);
  assert.deepEqual(result.checks.map(check => check.id), ["artifact", "environment"]);
});

test("production readiness requires the exact build to have reached staging", () => {
  const blocked = createWebReleaseReadiness("production", release, environment);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.checks.find(check => check.id === "staging")?.status, "action-required");

  const ready = createWebReleaseReadiness("production", { ...release, stagingStatus: "deployed" }, environment);
  assert.equal(ready.ready, true);
});

test("production warnings do not count as passed checks", () => {
  const result = createWebReleaseReadiness("production", { ...release, stagingStatus: "deployed" }, { ...environment, status: "warning" });
  assert.equal(result.ready, false);
});
