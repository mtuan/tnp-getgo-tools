import assert from "node:assert/strict";
import test from "node:test";
import { includeOriginalParameterSignatures } from "../src/features/quiz-editor/domain/generator-signatures";

test("question signatures include original-only parameters", () => {
  const result = includeOriginalParameterSignatures({
    paramsGeneratorTs: "() => { const lily = 'Lily'; const tom = 'Tom'; const sum = 146; const more = 30; return { lily, tom, sum, more } }",
    originParamsTs: "{ lily: 'Lily', tom: 'Tom', sum: 146, more: 30, choices: [58, 59] }",
    questionGeneratorTs: "({ lily, tom, sum, more }: __GetGoParams) => ({ text_en: lily })",
    explanationGeneratorTs: "({ lily, tom, sum, more }: __GetGoParams) => ({ en: tom })",
  });

  assert.match(result.questionGeneratorTs, /^\(\{ lily, tom, sum, more, choices \}: __GetGoParams\)/);
  assert.match(result.explanationGeneratorTs, /^\(\{ lily, tom, sum, more, choices \}: __GetGoParams\)/);
});

test("question signatures unwrap the visible original-parameters callback", () => {
  const result = includeOriginalParameterSignatures({
    paramsGeneratorTs: "() => ({ lily: 'Lily', tom: 'Tom', sum: 146, more: 30 })",
    originParamsTs: "() => {\n  return { lily: 'Lily', tom: 'Tom', sum: 146, more: 30, choices: [58, 59] }\n}",
    questionGeneratorTs: "({ lily, tom, sum, more }: __GetGoParams) => ({ answer: QB.answer.choice(sum, { choices }) })",
    explanationGeneratorTs: "({ lily, tom, sum, more }: __GetGoParams) => ({ en: tom })",
  });

  assert.match(result.questionGeneratorTs, /^\(\{ lily, tom, sum, more, choices \}: __GetGoParams\)/);
});

test("question signatures read callback-style original parameters with local declarations", () => {
  const result = includeOriginalParameterSignatures({
    paramsGeneratorTs: "() => ({ lily: 'Lily', tom: 'Tom', sum: 146, more: 30 })",
    originParamsTs: "() => {\n  const choices = [58, 88, 53, 63]\n  return { lily: 'Lily', tom: 'Tom', sum: 146, more: 30, choices }\n}",
    questionGeneratorTs: "({ lily, tom, sum, more }: __GetGoParams) => ({ answer: QB.answer.choice(sum, { choices }) })",
    explanationGeneratorTs: "({ lily, tom, sum, more }: __GetGoParams) => ({ en: tom })",
  });

  assert.match(result.questionGeneratorTs, /^\(\{ lily, tom, sum, more, choices \}: __GetGoParams\)/);
});
