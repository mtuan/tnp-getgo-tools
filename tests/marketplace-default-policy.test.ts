import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { guestPreviewQuizId } from "../src/features/topics/domain/marketplace-default-policy.js";
import {
  loadContentV2Quiz,
  patchContentV2TopicMarketplacePolicy,
  reconcileContentV2GuestPreview,
  saveContentV2Question,
  saveContentV2Quiz,
  saveContentV2Topic,
} from "../src/features/topics/repository/content-v2-repository.js";

test("guest preview keeps an eligible manual selection or chooses the first reviewed quiz", () => {
  const candidates = [
    { id: "b", order: 1, preview: false, questionCount: 1, reviewedQuestionCount: 1 },
    { id: "a", order: 0, preview: false, questionCount: 1, reviewedQuestionCount: 1 },
  ];
  assert.equal(guestPreviewQuizId(candidates), "a");
  assert.equal(guestPreviewQuizId(candidates.map((item) => ({ ...item, preview: item.id === "b" }))), "b");
  assert.equal(guestPreviewQuizId(candidates, "b"), "b");
  assert.equal(guestPreviewQuizId([{ ...candidates[0], questionCount: 0, reviewedQuestionCount: 0 }]), undefined);
});

test("new records receive marketplace defaults and reconciliation selects one reviewed quiz", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-marketplace-policy-"));
  const topic = await saveContentV2Topic(root, {
    schemaVersion: 2,
    id: "sample",
    type: "competition",
    title: { en: "Sample", vi: "Mẫu" },
    description: { en: "", vi: "" },
    subjects: ["mathematics"],
    grades: [1],
    supportedLanguages: ["en", "vi"],
    status: "pending",
    order: 0,
    subject: "mathematics",
    rounds: [],
    gradeGroups: [],
  });
  assert.equal(topic.marketplace?.preview, true);
  assert.equal(topic.marketplace?.experimental, false);
  assert.equal(topic.marketplace?.pricing?.type, "subscription");

  const quiz = await saveContentV2Quiz(root, topic, {
    schemaVersion: 2,
    id: "quiz-a",
    topicId: topic.id,
    type: "competition-paper",
    title: "Quiz A",
    description: "",
    sharedCode: "",
    status: "pending",
    order: 0,
    supportedLanguages: ["en", "vi"],
    grade: "1",
    round: "main",
    year: "2026",
  });
  assert.equal(quiz.marketplace?.preview, false);
  assert.equal(quiz.marketplace?.pricing, undefined);
  await saveContentV2Question(root, topic, quiz, {
    schemaVersion: 2,
    id: "q1",
    type: "competition-question",
    order: 0,
    status: "reviewed",
    text: { en: "1 + 1?" },
    assets: [],
    answer: { type: "input", correct: 2 },
  });
  const result = await reconcileContentV2GuestPreview(root, topic.id);
  assert.equal(result.selectedQuizId, "quiz-a");
  assert.equal((await loadContentV2Quiz(root, topic.id, quiz.id)).marketplace?.preview, true);
});

test("marketplace policy patch preserves unrelated topic fields exactly", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-marketplace-scope-"));
  const filePath = path.join(root, "content-v2", "topics", "sample", "topic.json");
  const raw = {
    schemaVersion: 2,
    id: "sample",
    contestId: "sample-contest",
    type: "competition",
    title: { en: "Sample Topic", vi: "Chủ đề mẫu" },
    description: { en: "Description", vi: "Mô tả" },
    subjects: ["mathematics"],
    grades: [1],
    status: "reviewed",
    order: 0,
    subject: "mathematics",
    rounds: [],
    gradeGroups: [],
    marketplace: {
      preview: false,
      experimental: true,
      tags: ["manual-tag"],
      pricing: { type: "free", currency: "VND" },
    },
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  await patchContentV2TopicMarketplacePolicy(root, "sample", {
    preview: true,
    experimental: false,
    pricing: { type: "subscription", currency: "VND" },
  });
  const updated = JSON.parse(await fs.readFile(filePath, "utf8")) as typeof raw;
  assert.deepEqual(updated.marketplace.tags, ["manual-tag"]);
  assert.equal("supportedLanguages" in updated, false);
  assert.deepEqual(Object.keys(updated), Object.keys(raw));
  assert.equal(updated.marketplace.preview, true);
  assert.equal(updated.marketplace.experimental, false);
  assert.equal(updated.marketplace.pricing.type, "subscription");
});
