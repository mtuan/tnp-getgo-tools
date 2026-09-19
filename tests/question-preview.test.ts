import assert from "node:assert/strict";
import test from "node:test";
import { localizedPreviewText } from "../src/shared/ui/question-preview-language";

test("a single available question language renders as primary text", () => {
  assert.deepEqual(
    localizedPreviewText("", "Chỉ có tiếng Việt"),
    { primary: "Chỉ có tiếng Việt" },
  );
  assert.deepEqual(
    localizedPreviewText("English only", undefined),
    { primary: "English only" },
  );
});

test("bilingual question text keeps English primary and Vietnamese secondary", () => {
  assert.deepEqual(
    localizedPreviewText("English", "Tiếng Việt"),
    { primary: "English", secondary: "Tiếng Việt" },
  );
});

test("a selected single language is primary with fallback to available text", () => {
  assert.deepEqual(
    localizedPreviewText("English", "Tiếng Việt", ["vi"]),
    { primary: "Tiếng Việt" },
  );
  assert.deepEqual(
    localizedPreviewText("", "Tiếng Việt", ["en"]),
    { primary: "Tiếng Việt" },
  );
});

test("the same resolver makes Vietnamese-only main and nested prompts primary", () => {
  assert.deepEqual(
    localizedPreviewText("", "Câu hỏi tiếng Việt"),
    { primary: "Câu hỏi tiếng Việt" },
  );
  assert.deepEqual(
    localizedPreviewText("", "a. Phần một"),
    { primary: "a. Phần một" },
  );
});
