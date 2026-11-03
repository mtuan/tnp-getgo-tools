import assert from "node:assert/strict";
import test from "node:test";
import { compactJobLogs, conciseJobError } from "../src/features/jobs/domain/job-report-presentation.js";

const copy = { connectionError: "Connection unavailable.", longError: "See the failed task." };

test("job reports replace noisy Codex connection dumps with an actionable summary", () => {
  const error = `${"2026-10-26 WARN codex_core_plugins failed to refresh\n".repeat(12)}workspace routing discovery failed`;
  assert.equal(conciseJobError(error, copy), copy.connectionError);
  assert.deepEqual(compactJobLogs([
    { timestamp: "2026-10-26T00:00:00.000Z", stream: "stderr", message: error },
  ], copy.connectionError).map(log => log.message), [copy.connectionError]);
});

test("job reports summarize structured validation errors by field", () => {
  const error = JSON.stringify([{ path: ["assets", 0], message: "Must start with asset:" }]);
  assert.equal(conciseJobError(error, copy), "assets.0: Must start with asset:");
});
