import assert from "node:assert/strict";
import test from "node:test";
import { preferredQuestionPrompt } from "../src/features/topics/pages/quiz-manager/shared.js";

test("question list prefers English text", () => {
  assert.equal(preferredQuestionPrompt("English", "Tiếng Việt"), "English");
});

test("question list falls back to Vietnamese when English text is empty", () => {
  assert.equal(preferredQuestionPrompt("", "Tiếng Việt"), "Tiếng Việt");
  assert.equal(preferredQuestionPrompt([], ["Dòng một", "Dòng hai"]), "Dòng một Dòng hai");
});
