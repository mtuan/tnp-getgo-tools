import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  containsContentV2InlineImage,
  extractContentV2InlineImageAssets,
} from "../src/features/topics/repository/content-v2-inline-assets.js";
import {
  loadContentV2Question,
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../src/features/topics/repository/content-v2-repository.js";

test("extracts repeated inline images once and replaces every occurrence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-inline-assets-"));
  const dataUrl = `data:image/png;base64,${Buffer.from("same image").toString("base64")}`;
  const source = {
    answer: { choices: { A: dataUrl } },
    dynamic: {
      questionGeneratorTs: `return ${JSON.stringify(dataUrl)};`,
      compiledJs: `const image = ${JSON.stringify(dataUrl)};`,
    },
  };

  const result = await extractContentV2InlineImageAssets(source, root);
  assert.equal(result.extractedCount, 1);
  assert.equal(containsContentV2InlineImage(result.value), false);
  const serialized = JSON.stringify(result.value);
  const references = serialized.match(/asset:inline-[a-f0-9]{20}\.png/g) ?? [];
  assert.equal(references.length, 3);
  assert.equal(new Set(references).size, 1);
  assert.equal((await fs.readdir(root)).length, 1);
});

test("leaves content without inline images unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-inline-assets-"));
  const source = { image: "asset:question-1.png" };
  const result = await extractContentV2InlineImageAssets(source, root);
  assert.equal(result.extractedCount, 0);
  assert.equal(result.value, source);
  assert.deepEqual(await fs.readdir(root), []);
});

test("content-v2 question persistence normalizes legacy inline asset entries before validation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-inline-question-"));
  const topic = await saveContentV2Topic(root, {
    schemaVersion: 2, id: "math", type: "competition", title: "Math", subject: "mathematics",
  });
  const quiz = await saveContentV2Quiz(root, topic, {
    schemaVersion: 2, id: "paper", topicId: topic.id, type: "competition-paper",
    title: "Paper", grade: "3", round: "main", year: "2026",
  });
  const dataUrl = `data:image/png;base64,${Buffer.from("legacy image").toString("base64")}`;
  const question = {
    schemaVersion: 2, id: "q1", type: "competition-question", order: 1,
    status: "draft", text: { en: "Question" }, assets: [dataUrl],
    answer: { type: "input", correct: "1" },
  };

  const saved = await saveContentV2Question(root, topic, quiz, question);
  assert.match(saved.assets[0], /^asset:inline-[a-f0-9]{20}\.png$/);

  const questionPath = path.join(root, "content-v2", "topics", topic.id, "quizzes", quiz.id, "questions", "q1.json");
  await fs.writeFile(questionPath, JSON.stringify(question));
  const loaded = await loadContentV2Question(root, topic.id, quiz.id, "q1");
  assert.match(loaded.assets[0], /^asset:inline-[a-f0-9]{20}\.png$/);
});
