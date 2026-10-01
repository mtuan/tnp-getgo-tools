import assert from "node:assert/strict";
import test from "node:test";
import {
  amcPaperTitle,
  amcQuizId,
  amcTopicId,
  extractChoiceMap,
  extractCorrectChoice,
} from "../src/features/amc-import/domain/amc-import.js";
import { contentV2QuestionSchema, contentV2QuizSchema, contentV2TopicSchema } from "../src/features/topics/domain/content-v2.js";

test("AMC identifiers map to valid content-v2 topic and quiz IDs", () => {
  assert.equal(amcTopicId("AMC 10A"), "amc-10a");
  assert.equal(amcQuizId("AMC 10A", 2026), "amc-10a-2026");
  assert.equal(amcPaperTitle("AMC 10A", 2026), "2026_AMC_10A_Problems");
  assert.equal(amcTopicId("USA(J)MO"), "usa-j-mo");
});

test("extracts AoPS multiple-choice labels and values", () => {
  assert.deepEqual(extractChoiceMap("Find x. (A) 1 (B) $2^2$ (C) 5 (D) 6 (E) 7"), {
    A: "1", B: "$2^2$", C: "5", D: "6", E: "7",
  });
  assert.deepEqual(extractChoiceMap("Find x. \\textbf{(A) } 1 \\textbf{(B) } 2"), { A: "1", B: "2" });
});

test("extracts the correct choice from any solution", () => {
  assert.equal(extractCorrectChoice([{ text: "Therefore the answer is (C)." }]), "C");
  assert.equal(extractCorrectChoice([{ text: "We obtain \\boxed{D}." }]), "D");
  assert.equal(extractCorrectChoice([{ text: "Thus \\boxed{\\textbf{(B)}}." }]), "B");
  assert.equal(extractCorrectChoice([{ text: "No final choice yet." }]), "");
});

test("AMC provenance and multiple solutions use typed content-v2 records", () => {
  const source = { provider: "AoPS", url: "https://artofproblemsolving.com/wiki/test", importedAt: "2026-10-01T00:00:00.000Z" };
  assert.equal(contentV2TopicSchema.parse({ schemaVersion: 2, id: "amc-8", type: "competition", title: "AMC 8", description: "", subject: "Mathematics", subjects: ["Mathematics"], grades: [8], rounds: [], gradeGroups: [], status: "draft", order: 0, source }).source?.provider, "AoPS");
  assert.equal(contentV2QuizSchema.parse({ schemaVersion: 2, id: "amc-8-2026", topicId: "amc-8", type: "competition-paper", title: "2026 AMC 8", description: "", supportedLanguages: ["en"], grade: "8", round: "amc-8", year: "2026", sharedCode: "", status: "draft", order: 0, source }).source?.url, source.url);
  const question = contentV2QuestionSchema.parse({ schemaVersion: 2, id: "q1", type: "competition-question", order: 0, status: "pending", text: { en: "Problem" }, assets: [], answer: { type: "input", correct: "1" }, source, solutions: [{ title: "Solution 1", text: "Proof" }] });
  assert.equal(question.type === "competition-question" ? question.solutions?.[0]?.text : undefined, "Proof");
});
