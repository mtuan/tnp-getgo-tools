import assert from "node:assert/strict";
import test from "node:test";
import { CodexEventCollector } from "../src/features/ai/main/codex-cli-ai.js";

test("Codex events detect completed turns across split stdout chunks", () => {
  const events = new CodexEventCollector();
  assert.equal(events.push('{"type":"thread.started","thread_id":"thread-1"}\n{"type":"item.'), false);
  assert.equal(events.push('completed"}\n{"type":"turn.completed"}\n'), true);
  assert.equal(events.threadId, "thread-1");
});

test("Codex events ignore malformed diagnostic output", () => {
  const events = new CodexEventCollector();
  assert.equal(events.push('not-json\n{"type":"turn.completed"}\n'), true);
});

test("Codex events accept a final completion event without a newline", () => {
  const events = new CodexEventCollector();
  assert.equal(events.push('{"type":"turn.completed"}'), true);
});

test("Codex events do not accept schema-shaped intermediate messages as completion", () => {
  const events = new CodexEventCollector();
  const output = JSON.stringify({ paramsGeneratorTs: "() => ({})" });
  assert.equal(events.push(`${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: output } })}\n`), false);
  assert.equal(events.push('{"type":"turn.completed"}\n'), true);
});

test("Codex events retain service errors emitted on stdout", () => {
  const events = new CodexEventCollector();
  assert.equal(events.push('{"type":"error","message":"You have hit your weekly limit"}\n'), false);
  assert.equal(events.errorMessage, "You have hit your weekly limit");
  assert.equal(events.push('{"type":"turn.failed","error":{"message":"Too many requests"}}\n'), false);
  assert.equal(events.errorMessage, "Too many requests");
});
