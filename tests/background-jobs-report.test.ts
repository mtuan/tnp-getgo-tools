import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ipcSource = readFileSync(new URL("../src/features/jobs/main/background-jobs-ipc.ts", import.meta.url), "utf8");
const drawerSource = readFileSync(new URL("../src/features/deployment/components/DeploymentJobReportDrawer.tsx", import.meta.url), "utf8");

test("every background job receives a structured task report", () => {
  assert.match(ipcSource, /const withTaskReport = \(job: BackgroundJob\)/);
  assert.match(ipcSource, /if \(job\.report\) return job/);
  assert.match(ipcSource, /id: "overall-progress"/);
  assert.match(ipcSource, /completed: job\.completed/);
  assert.match(ipcSource, /total: Math\.max\(1, job\.total\)/);
  assert.match(ipcSource, /\.map\(withTaskReport\)[\s\S]*?\.map\(withFallbackLogs\)/);
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
