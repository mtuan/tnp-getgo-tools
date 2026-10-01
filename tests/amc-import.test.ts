import assert from "node:assert/strict";
import test from "node:test";
import {
  amcPaperTitle,
  amcQuizId,
  amcTopicId,
  extractChoiceMap,
  extractCorrectChoice,
} from "../src/features/amc-import/domain/amc-import.js";

test("AMC identifiers map to valid content-v2 topic and quiz IDs", () => {
  assert.equal(amcTopicId("AMC 10A"), "amc-10a");
  assert.equal(amcQuizId("AMC 10A", 2026), "amc-10a-2026");
  assert.equal(amcPaperTitle("AMC 10A", 2026), "2026_AMC_10A_Problems");
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
