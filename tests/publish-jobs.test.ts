import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PublishJobManager, publishJobDetailControl } from "../src/features/jobs/main/publish-jobs.js";

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

test("publish jobs expose item-level totals and current-step progress", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-progress-"));
  const manager = new PublishJobManager(directory);
  await manager.track(
    { name: "Publish quiz", description: "Detailed progress", route: "/topics/a" },
    async (control) => {
      await control.setTotal(5, "Preparing questions 0/2");
      await control.advance("Preparing questions 1/2");
      await control.advance("Preparing questions 2/2");
      await control.advance("Uploading assets 1/2");
      await control.advance("Uploading assets 2/2");
      await control.advance("Verified published quiz");
    },
  );
  const job = (await manager.list())[0]!;
  assert.equal(job.total, 5);
  assert.equal(job.completed, 5);
  assert.equal(job.progressLabel, "Published");
});

test("nested publish details do not consume overall progress", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-details-"));
  const manager = new PublishJobManager(directory);
  await manager.track(
    { name: "Sync marketplace", description: "Two quizzes", route: "/topics", initialTotal: 2 },
    async (control) => {
      const detail = publishJobDetailControl(control);
      await detail.setTotal(50, "Publishing first quiz");
      await detail.advance("Verified published quiz");
      await control.advance("Synchronized first quiz");
      await detail.setTotal(75, "Publishing second quiz");
      await detail.advance("Uploading assets 1/10");
      const running = (await manager.list())[0]!;
      assert.equal(running.completed, 1);
      assert.equal(running.total, 2);
      assert.equal(running.progressLabel, "Uploading assets 1/10");
      await control.advance("Synchronized second quiz");
    },
  );
  const completed = (await manager.list())[0]!;
  assert.equal(completed.completed, 2);
  assert.equal(completed.total, 2);
});

test("publish jobs add newly discovered work without resetting completed progress", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-discovered-"));
  const manager = new PublishJobManager(directory);
  await manager.track(
    { name: "Sync marketplace", description: "One preview item", route: "/topics", initialTotal: 1 },
    async (control) => {
      await control.addTotal(2, "Discovered 2 additional marketplace items");
      await control.advance("Synchronized first item");
      const running = (await manager.list())[0]!;
      assert.equal(running.completed, 1);
      assert.equal(running.total, 3);
      await control.advance("Synchronized second item");
      await control.advance("Synchronized third item");
    },
  );
  const completed = (await manager.list())[0]!;
  assert.equal(completed.completed, 3);
  assert.equal(completed.total, 3);
});

test("publish jobs expose known totals immediately when started", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-initial-progress-"));
  const manager = new PublishJobManager(directory);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = await manager.start(
    {
      name: "Sync marketplace · All topics",
      description: "6 topics · 12 quizzes",
      route: "/topics",
      initialTotal: 18,
      initialProgressLabel: "Preparing 6 topics and 12 quizzes",
    },
    async () => blocked,
  );
  assert.equal(started.total, 18);
  assert.equal(started.completed, 0);
  assert.equal(started.progressLabel, "Preparing 6 topics and 12 quizzes");
  release();
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

test("failed publish jobs retry the operation and terminal jobs can be deleted", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-publish-retry-"));
  const manager = new PublishJobManager(directory);
  let attempts = 0;
  await assert.rejects(
    manager.track(
      { name: "Publish quiz", description: "Retryable", route: "/topics/a" },
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("Temporary failure");
      },
    ),
    /Temporary failure/,
  );
  const failed = (await manager.list())[0]!;
  assert.equal(failed.retryable, true);
  await manager.retry(failed.id);
  for (let attempt = 0; attempt < 40 && attempts < 2; attempt += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
  const retried = await manager.list();
  assert.equal(attempts, 2);
  assert.equal(retried[0]?.status, "completed");
  await manager.delete(retried[0]!.id);
  await manager.delete(failed.id);
  assert.equal((await manager.list()).length, 0);
});
