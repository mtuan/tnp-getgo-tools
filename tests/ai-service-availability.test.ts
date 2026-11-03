import assert from "node:assert/strict";
import test from "node:test";
import { isAiServiceUnavailableError } from "../src/features/ai/main/ai-service-availability.js";

test("recognizes AI quota and availability failures", () => {
  const messages = [
    "HTTP status: 429 Too Many Requests",
    "You have hit your 5-hour usage limit. Try again later.",
    "You've hit your weekly limit",
    "insufficient_quota",
    "The service is temporarily unavailable",
    "OpenAI request could not be completed.\nReason: fetch failed",
  ];
  for (const message of messages)
    assert.equal(isAiServiceUnavailableError(new Error(message)), true, message);
});

test("does not classify question-specific generation failures as service outages", () => {
  const messages = [
    "The generated question does not reproduce the original answer.",
    "OpenAI returned invalid structured output.",
    "Codex CLI did not return a dynamic-question proposal.",
  ];
  for (const message of messages)
    assert.equal(isAiServiceUnavailableError(new Error(message)), false, message);
});

test("recognizes an unavailable service through an error cause", () => {
  const cause = new Error("request failed", { cause: new Error("rate_limit_exceeded") });
  assert.equal(isAiServiceUnavailableError(cause), true);
});
