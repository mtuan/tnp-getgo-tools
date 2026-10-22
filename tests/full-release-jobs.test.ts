import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { archivedWebDeploymentSteps, parseDeployResult, releaseCommands } from "../src/features/deployment/main/full-release-jobs.js";
import { createReleaseJobReport } from "../src/features/deployment/main/release-job-report.js";

const source = readFileSync(new URL("../src/features/deployment/main/full-release-jobs.ts", import.meta.url), "utf8");
const reportSource = readFileSync(new URL("../src/features/deployment/main/release-job-report.ts", import.meta.url), "utf8");
const releaseScript = readFileSync(new URL("../scripts/deployment/release-web.mjs", import.meta.url), "utf8");
const appleSecretSource = readFileSync(new URL("../src/features/deployment/main/apple-iap-secret.ts", import.meta.url), "utf8");

test("archived Web deployments expose detailed progress tasks", () => {
  assert.equal(archivedWebDeploymentSteps, 8);
});

test("immutable Web builds expose structured task progress", () => {
  assert.match(reportSource, /Run application code checks/);
  assert.match(reportSource, /Assemble Web and Firebase payload/);
  assert.match(reportSource, /Create and verify immutable archive/);
  assert.match(source, /createReleaseJobReport\("build", "staging"/);
  assert.match(source, /advanceReleaseJobReport\(job, completedBefore \+ progress\.completed/);
  assert.match(source, /finishReleaseJobReport\(job, "failed"\)/);
  assert.match(source, /finishReleaseJobReport\(job, "cancelled"\)/);
});

test("archived Web deployments persist all eight canonical tasks", () => {
  assert.match(source, /createReleaseJobReport\("deploy", target, new Date\(\)\.toISOString\(\), "archived"\)/);
  assert.equal(createReleaseJobReport("deploy", "staging", "2026-01-01T00:00:00.000Z", "archived").steps.length, 8);
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

test("production Web activation enforces every readiness check", () => {
  assert.match(source, /async webReleaseReadiness\(target: ReleaseTarget, releaseId: string\)/);
  assert.match(source, /createWebReleaseReadiness\(target, release, environment\)/);
  assert.match(source, /job\.target === "production" \|\| !job\.checklistBypassed/);
  assert.match(releaseScript, /manifest\.environments\.staging\.status !== 'deployed'/);
  assert.match(releaseScript, /environment === 'production' && functionPlan\.skippedCodebases\.length > 0/);
});

test("Web activation queues before its remote readiness recheck", () => {
  const activate = source.slice(source.indexOf("async activateWeb"), source.indexOf("async startWebBuild"));
  const runner = source.slice(source.indexOf("private async run(job"), source.indexOf("private runCommand"));
  assert.doesNotMatch(activate, /await this\.webReleaseReadiness/);
  assert.match(runner, /await this\.webReleaseReadiness\(job\.target, job\.releaseId\)/);
});

test("only staging activation can retain an explicit checklist bypass", () => {
  assert.match(source, /checklistBypassed: target === "staging" && bypassChecklist/);
});

test("Apple purchase readiness exposes an in-product secret setup action", () => {
  assert.match(source, /async configureAppleIapSecret\(target: ReleaseTarget\)/);
  assert.match(appleSecretSource, /"functions:secrets:set", "GETGO_APPLE_IAP_CONFIG"/);
  assert.match(appleSecretSource, /JSON\.stringify\(\{ bundleId, appAppleId \}\)/);
});

test("every Web target declares Google Play purchase verification", () => {
  for (const target of ["getgo-dev", "getgo-staging", "getgo"]) {
    const config = JSON.parse(readFileSync(new URL(`../configs/deploys/${target}/target.json`, import.meta.url), "utf8")) as {
      functionCodebases: Array<{ id: string; requiredSecrets?: string[] }>;
    };
    const billing = config.functionCodebases.find(codebase => codebase.id === "billing");
    assert.ok(billing?.requiredSecrets?.includes("GETGO_GOOGLE_PLAY_IAP_CONFIG"));
  }
});

test("Google Play purchase readiness exposes an in-product secret setup action", () => {
  assert.match(source, /async configureGooglePlayIapSecret\(target: ReleaseTarget\)/);
  assert.match(appleSecretSource, /"functions:secrets:set", "GETGO_GOOGLE_PLAY_IAP_CONFIG"/);
  assert.match(appleSecretSource, /JSON\.stringify\(\{ packageName \}\)/);
});
