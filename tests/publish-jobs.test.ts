import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PublishJobManager } from "../src/main/publish-jobs.js";

test("publish jobs persist completed and failed operation history", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-jobs-"));
  const manager = new PublishJobManager(directory);
  const value = await manager.track(
    { name: "Publish quiz", description: "One quiz", route: "/topics/a" },
    async () => 42,
  );
  assert.equal(value, 42);
  await assert.rejects(
    manager.track(
      { name: "Failed publish", description: "One quiz", route: "/topics/b" },
      async () => { throw new Error("Network failed"); },
    ),
    /Network failed/,
  );
  const jobs = await manager.list();
  assert.equal(jobs[0]?.status, "failed");
  assert.equal(jobs[0]?.error, "Network failed");
  assert.equal(jobs[1]?.status, "completed");
  assert.equal(jobs[1]?.completed, 1);
});

test("publish jobs pause, resume, and cancel at safe checkpoints", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-control-"));
  const manager = new PublishJobManager(directory);
  let reachCheckpoint!: () => void;
  const beforeCheckpoint = new Promise<void>((resolve) => { reachCheckpoint = resolve; });
  const job = await manager.start(
    { name: "Publish quiz", description: "Controlled", route: "/topics/a" },
    async (control) => {
      await beforeCheckpoint;
      await control.checkpoint();
    },
  );
  await manager.pause(job.id);
  assert.equal((await manager.list())[0]?.status, "paused");
  reachCheckpoint();
  await manager.resume(job.id);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await manager.list())[0]?.status, "completed");

  let reachCancelledCheckpoint!: () => void;
  const cancelledCheckpoint = new Promise<void>((resolve) => { reachCancelledCheckpoint = resolve; });
  const cancelled = await manager.start(
    { name: "Publish quiz", description: "Cancelled", route: "/topics/b" },
    async (control) => {
      await cancelledCheckpoint;
      await control.checkpoint();
    },
  );
  await manager.cancel(cancelled.id);
  reachCancelledCheckpoint();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await manager.list())[0]?.status, "cancelled");
});
