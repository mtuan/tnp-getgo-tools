import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cleanDeploymentLogLine, shouldWaitForFirestoreIndexes } from "../src/features/deployment/main/web-deployment-jobs.js";

const source = readFileSync(new URL("../src/features/deployment/main/web-deployment-jobs.ts", import.meta.url), "utf8");
const deployScript = readFileSync(new URL("../scripts/deployment/deploy-web.mjs", import.meta.url), "utf8");

test("waits for Firestore indexes only when that resource was deployed", () => {
  assert.equal(shouldWaitForFirestoreIndexes("deploy", "firebase", new Set(["firestore:indexes"])), true);
  assert.equal(shouldWaitForFirestoreIndexes("deploy", "firebase", new Set(["functions:getgo-billing:getGoVietQrApi"])), false);
  assert.equal(shouldWaitForFirestoreIndexes("build", "firebase", new Set(["firestore:indexes"])), false);
  assert.equal(shouldWaitForFirestoreIndexes("deploy", "web", new Set(["firestore:indexes"])), false);
});

test("deployment logs redact Firebase source tokens", () => {
  assert.equal(
    cleanDeploymentLogLine('{"sourceToken":"secret-value","status":"ok"}'),
    '{"sourceToken":"[redacted]","status":"ok"}',
  );
  assert.equal(cleanDeploymentLogLine("Got source token secret-value"), "Got source token [redacted]");
});

test("cancelling a deployment responds without recomputing artifact metadata and escalates termination", () => {
  assert.match(source, /finalizeReport\(job, "cancelled", false\)/);
  assert.match(source, /runtime\.killTimer = setTimeout\([\s\S]*?this\.signal\(runtime, "SIGKILL"\)/);
  assert.match(source, /runtime\.killTimer\.unref\(\)/);
});

test("deployment reports expose the complete task list before work starts", () => {
  assert.match(source, /status: index === 0 \? "running" : "pending"/);
  assert.match(source, /for \(const step of job\.report\.steps\) if \(step\.status === "pending"\) step\.status = "skipped"/);
  assert.match(source, /total: progressTotal\(operation, component\)/);
  assert.match(source, /return reportStepIds\(operation, component\)\.length/);
  assert.match(source, /compatibility: "Test legacy Firebase compatibility"/);
});

test("staging and production Firebase preparation run legacy compatibility tests", () => {
  assert.match(deployScript, /function runFirebaseRulesCompatibilityTests\(\)/);
  assert.match(deployScript, /target === 'getgo-dev' \|\| webOnly \|\| deployOnly/);
  assert.match(deployScript, /'npm run test:firebase-rules'/);
  const assembleStorage = deployScript.indexOf('assembleStorageRules()');
  const compatibilityTest = deployScript.lastIndexOf('runFirebaseRulesCompatibilityTests()');
  const assembleFunctions = deployScript.lastIndexOf('assembleFunctionsSrc()');
  assert.ok(assembleStorage >= 0 && compatibilityTest > assembleStorage && assembleFunctions > compatibilityTest);
});

test("Firestore rule validation accepts post-commit access built-ins", () => {
  assert.match(deployScript, /\['get', 'exists', 'getAfter', 'existsAfter', 'debug'\]/);
});

test("unchanged Firebase-only deployments exit before expensive preparation", () => {
  const fastPath = deployScript.indexOf("storedHashes['firebase:inputs'] === firebaseInputHash");
  const preparation = deployScript.indexOf("'npm run prepare:shared'");
  assert.ok(fastPath >= 0);
  assert.ok(preparation >= 0);
  assert.ok(fastPath < preparation);
  assert.match(deployScript, /Everything is already up to date\. No preparation or cloud deployment is needed/);
});

test("successful Firebase jobs reuse verified deployment hashes for their build record", () => {
  assert.match(source, /recordFirebaseBuildFromDeploymentHashes/);
  assert.match(source, /finalizeReport\(job, "completed", job\.component !== "firebase"\)/);
  assert.doesNotMatch(source, /job\.component === "firebase"[\s\S]{0,300}await this\.recordBuild\(job\.component/);
});

test("Firebase deployment hashes stay in the Tools Git project", () => {
  assert.doesNotMatch(source, /GETGO_DEPLOY_STATE_ROOT/);
  assert.doesNotMatch(deployScript, /GETGO_DEPLOY_STATE_ROOT/);
  assert.match(deployScript, /const stateRoot = join\(toolsRoot, '\.state'\)/);
});

test("function planning and status use per-export hashes instead of whole-codebase hashes", () => {
  assert.doesNotMatch(deployScript, /digest\.update\(hashDir\(join\(codebase\.dir, 'vendor'\)\)\)/);
  assert.doesNotMatch(deployScript, /hashChanged\(`functions:\$\{codebase\.name \?\? 'default'\}`\)/);
  assert.match(source, /function-deploy-hashes\.mjs/);
  assert.match(source, /`functions:\$\{codebase\}:\$\{name\}`/);
});

test("an unchanged legacy codebase baseline migrates without redeploying every export", () => {
  assert.match(deployScript, /legacyFunctionCodebaseHashes\.set\(codebase, legacyDigest\.digest\('hex'\)\)/);
  assert.match(deployScript, /storedHashes\[codebaseKey\] !== legacyFunctionCodebaseHashes\.get\(codebase\)/);
  assert.match(deployScript, /delete storedHashes\[codebaseKey\]/);
});

test("Cloud Functions codebases reuse one lock-aware dependency installation", () => {
  assert.match(deployScript, /const functionsDependencyCacheDir = join\(toolsRoot, '\.state', 'functions-dependencies'\)/);
  assert.match(deployScript, /installedHash === inputs\.hash && existsSync\(sharedFunctionsNodeModules\)/);
  assert.match(deployScript, /symlinkSync\(sharedFunctionsNodeModules, nodeModulesLink, 'dir'\)/);
  assert.equal(deployScript.match(/npm ci --ignore-scripts --no-audit --no-fund/g)?.length, 1);
  assert.doesNotMatch(deployScript, /Installing locked dependencies: \$\{codebaseName\}/);
});
