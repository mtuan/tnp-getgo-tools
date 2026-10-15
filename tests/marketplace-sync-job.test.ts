import assert from "node:assert/strict";
import test from "node:test";
import {
  isActiveMarketplaceSyncJob,
  marketplaceSyncAllJobName,
  marketplaceSyncTopicJobName,
} from "../src/features/topics/domain/marketplace-sync-job.js";

test("recognizes active all-topic and selected-topic marketplace sync jobs", () => {
  assert.equal(
    isActiveMarketplaceSyncJob({
      kind: "publish",
      name: marketplaceSyncAllJobName,
      status: "running",
    }),
    true,
  );
  assert.equal(
    isActiveMarketplaceSyncJob({
      kind: "publish",
      name: marketplaceSyncTopicJobName("timo-pr-k"),
      status: "queued",
    }),
    true,
  );
});

test("does not confuse review sync or completed work with content sync", () => {
  assert.equal(
    isActiveMarketplaceSyncJob({
      kind: "publish",
      name: "Sync marketplace reviews · All topics",
      status: "running",
    }),
    false,
  );
  assert.equal(
    isActiveMarketplaceSyncJob({
      kind: "publish",
      name: marketplaceSyncTopicJobName("timo-pr-k"),
      status: "completed",
    }),
    false,
  );
});
