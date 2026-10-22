import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BackgroundJob } from "../src/shared/domain/models.js";
import { normalizeBackgroundJobReport } from "../src/features/jobs/main/background-job-report.js";

const ipcSource = readFileSync(new URL("../src/features/jobs/main/background-jobs-ipc.ts", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("../src/features/deployment/components/DeploymentJobReportDrawer.tsx", import.meta.url), "utf8");

test("every background job receives a structured task report", () => {
  assert.match(ipcSource, /\.map\(normalizeBackgroundJobReport\)[\s\S]*?\.map\(withFallbackLogs\)/);
  const job: BackgroundJob = {
    id: "release-1", kind: "deploy", component: "release", operation: "deploy", target: "staging",
    releaseId: "getgo-test", name: "Activate release", description: "Deploy release", status: "failed",
    completed: 0, total: 8, createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:01.000Z",
    finishedAt: "2026-01-01T00:00:02.000Z", cancellable: false, retryable: true, error: "Readiness failed",
  };
  const normalized = normalizeBackgroundJobReport(job);
  assert.equal(normalized.report?.steps.length, 8);
  assert.equal(normalized.total, 8);
  assert.equal(normalized.report?.steps[0].status, "failed");
  assert.equal(normalized.report?.steps.slice(1).every(step => step.status === "skipped"), true);
});

test("item-based jobs keep one measured operation instead of fake task rows", () => {
  const job: BackgroundJob = {
    id: "publish-1", kind: "publish", name: "Publish topics", description: "Publish", status: "running",
    completed: 4, total: 10, createdAt: "2026-01-01T00:00:00.000Z", startedAt: "2026-01-01T00:00:01.000Z",
    cancellable: true,
  };
  const normalized = normalizeBackgroundJobReport(job);
  assert.equal(normalized.report?.steps.length, 1);
  assert.equal(normalized.report?.steps[0].completed, 4);
  assert.equal(normalized.report?.steps[0].total, 10);
});

test("the report task table renders measured job progress", () => {
  assert.match(drawerSource, /typeof step\.completed === "number"/);
  assert.match(drawerSource, /Math\.round\(\(step\.completed! \/ step\.total!\) \* 100\)/);
  assert.match(drawerSource, /step\.status === "running" && !hasMeasuredProgress/);
});

test("every job report uses the same canonical inline section layout", () => {
  assert.match(drawerSource, /className="deployment-report-panels deployment-report-sections-inline"/);
  assert.equal((drawerSource.match(/variant="inline"/g) ?? []).length, 4);
  assert.doesNotMatch(drawerSource, /isWebReleaseReport|sectionVariant|variant="panel"/);
});
