import assert from "node:assert/strict";
import test from "node:test";
import {
  generationPerformance,
  generationSpeed,
} from "../src/features/quiz-editor/domain/generation-performance";

test("classifies generation duration against the editor timeout", () => {
  assert.equal(generationSpeed(249), "fast");
  assert.equal(generationSpeed(250), "normal");
  assert.equal(generationSpeed(999), "normal");
  assert.equal(generationSpeed(1_000), "slow");
});

test("keeps useful precision for short generation durations", () => {
  assert.deepEqual(generationPerformance(12.34), {
    durationMs: 12.3,
    speed: "fast",
  });
  assert.deepEqual(generationPerformance(312.6), {
    durationMs: 313,
    speed: "normal",
  });
});
