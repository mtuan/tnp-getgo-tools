import assert from "node:assert/strict";
import test from "node:test";
import {
  codexQuestionGeneratorMarker,
  isBulkCodexQuestionCandidate,
} from "../src/features/ai/domain/bulk-question-generation.js";
import type { QuizQuestionRecord } from "../src/shared/domain/models.js";

const dynamic = (paramsGeneratorTs = "() => ({})"): QuizQuestionRecord => ({
  question_no: 1,
  authoringMode: "advanced-dynamic",
  advancedDynamic: {
    paramsGeneratorTs,
    questionGeneratorTs: "() => QB.template({})",
    originParamsTs: "{}",
    explanationGeneratorTs: "() => ({})",
  },
});

test("bulk Codex generation selects image-free static questions", () => {
  assert.equal(isBulkCodexQuestionCandidate({ question_no: 1 }), true);
  assert.equal(isBulkCodexQuestionCandidate({ question_no: 1, image_datas: ["asset:q1.png"] }), false);
});

test("bulk Codex generation upgrades legacy dynamic code only once", () => {
  assert.equal(isBulkCodexQuestionCandidate(dynamic()), true);
  assert.equal(isBulkCodexQuestionCandidate(dynamic("() => ({ value: QB.rnd.int(1, 10) })")), true);
  assert.equal(isBulkCodexQuestionCandidate(dynamic(`${codexQuestionGeneratorMarker}\n() => ({})`)), false);
});

test("legacy dynamic questions remain eligible when they use images", () => {
  assert.equal(isBulkCodexQuestionCandidate({
    ...dynamic("() => ({ value: QB.rnd.int(1, 10) })"),
    image_datas: ["asset:diagram.png"],
  }), true);
});

test("effectively static image questions remain static", () => {
  assert.equal(isBulkCodexQuestionCandidate({ ...dynamic("() => ({})"), image_datas: ["asset:q1.png"] }), false);
});

test("bulk Codex generation never replaces reviewed or reference questions", () => {
  assert.equal(isBulkCodexQuestionCandidate({ question_no: 1, status: "verified" }), false);
  assert.equal(isBulkCodexQuestionCandidate({ question_no: 2, authoringMode: "reference", reference: { questionNo: 1 } }), false);
});
