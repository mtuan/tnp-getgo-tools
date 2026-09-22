import assert from "node:assert/strict";
import test from "node:test";
import { stopWindowsProcessTree } from "../src/features/deployment/main/stop-windows-process-tree.js";

test("stops the process tree without forcing when taskkill succeeds", async () => {
  const calls: string[][] = [];
  await stopWindowsProcessTree(123, false, async args => { calls.push(args); }, () => true);
  assert.deepEqual(calls, [["/PID", "123", "/T"]]);
});

test("retries with /F when Windows rejects graceful console termination", async () => {
  const calls: string[][] = [];
  await stopWindowsProcessTree(123, false, async args => {
    calls.push(args);
    if (!args.includes("/F")) throw new Error("This process can only be terminated forcefully");
  }, () => true);
  assert.deepEqual(calls, [["/PID", "123", "/T"], ["/PID", "123", "/T", "/F"]]);
});

test("treats a process that exited during taskkill as already stopped", async () => {
  let calls = 0;
  await stopWindowsProcessTree(123, false, async () => {
    calls++;
    throw new Error("Process not found");
  }, () => false);
  assert.equal(calls, 1);
});

test("preserves a forced termination failure when the process is still alive", async () => {
  await assert.rejects(() => stopWindowsProcessTree(123, false, async args => {
    throw new Error(args.includes("/F") ? "Access denied" : "Force required");
  }, () => true), /Access denied/);
});

test("an explicit forced stop does not retry the same failed command", async () => {
  let calls = 0;
  await assert.rejects(() => stopWindowsProcessTree(123, true, async args => {
    calls++;
    assert.ok(args.includes("/F"));
    throw new Error("Access denied");
  }, () => true), /Access denied/);
  assert.equal(calls, 1);
});
