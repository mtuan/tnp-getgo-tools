import assert from "node:assert/strict";
import test from "node:test";
import { parseMathText } from "@tnp/getgo-logics/quiz-builder";
import { protectMarkdownMath } from "../src/shared/ui/markdownMath";

test("protects standard LaTeX delimiters before Markdown parsing", () => {
  const source = "Thus \\(AD = AC - CD\\).\n\n\\[AD^2 + 57 = AB^2 \\Longrightarrow 57 = (AB-AD)(AB+AD).\\]";
  const protectedSource = protectMarkdownMath(source);

  assert.equal(
    protectedSource,
    "Thus $AD = AC - CD$.\n\n$$AD^2 + 57 = AB^2 \\Longrightarrow 57 = (AB-AD)(AB+AD).$$",
  );

  assert.deepEqual(parseMathText(protectedSource), [
    { type: "text", value: "Thus " },
    { type: "math", value: { latex: "AD = AC - CD", inline: true } },
    { type: "text", value: ".\n\n" },
    {
      type: "math",
      value: {
        latex: "AD^2 + 57 = AB^2 \\Longrightarrow 57 = (AB-AD)(AB+AD).",
        inline: false,
      },
    },
  ]);
});

test("leaves unmatched standard LaTeX delimiters unchanged", () => {
  const source = "Keep \\[this unmatched block";
  assert.equal(protectMarkdownMath(source), source);
});
