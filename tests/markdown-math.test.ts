import assert from "node:assert/strict";
import test from "node:test";
import { protectMarkdownMath } from "../src/shared/ui/markdownMath";

test("protects standard LaTeX delimiters before Markdown parsing", () => {
  const source = "Thus \\(AD = AC - CD\\).\n\n\\[AD^2 + 57 = AB^2 \\Longrightarrow 57 = (AB-AD)(AB+AD).\\]";
  const protectedSource = protectMarkdownMath(source);

  assert.equal(
    protectedSource.markdown,
    "Thus GETGOMATHPLACEHOLDER0TOKEN.\n\nGETGOMATHPLACEHOLDER1TOKEN",
  );
  assert.deepEqual(protectedSource.formulas.get("GETGOMATHPLACEHOLDER0TOKEN"), {
    latex: "AD = AC - CD",
    inline: true,
  });
  assert.deepEqual(protectedSource.formulas.get("GETGOMATHPLACEHOLDER1TOKEN"), {
    latex: "AD^2 + 57 = AB^2 \\Longrightarrow 57 = (AB-AD)(AB+AD).",
    inline: false,
  });
});

test("leaves unmatched standard LaTeX delimiters unchanged", () => {
  const source = "Keep \\[this unmatched block";
  const protectedSource = protectMarkdownMath(source);
  assert.equal(protectedSource.markdown, source);
  assert.equal(protectedSource.formulas.size, 0);
});

test("preserves array row separators inside protected display math", () => {
  const latex = String.raw`\begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array}`;
  const protectedSource = protectMarkdownMath(`Before \\[${latex}\\] after`);
  assert.equal(protectedSource.markdown, "Before GETGOMATHPLACEHOLDER0TOKEN after");
  assert.deepEqual(protectedSource.formulas.get("GETGOMATHPLACEHOLDER0TOKEN"), {
    latex,
    inline: false,
  });
});

test("protects every supported math source before Markdown sees it", () => {
  const array = String.raw`\begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array}`;
  const source = [
    String.raw`Inline $x_1 + x_2$`,
    String.raw`display $$${array}$$`,
    String.raw`environment ${array}`,
    String.raw`canonical #math:{"latex":"a_b \\\\ c_d","inline":false}#`,
  ].join("\n");
  const protectedSource = protectMarkdownMath(source);

  assert.equal(protectedSource.formulas.size, 4);
  assert.equal(protectedSource.markdown.includes("\\"), false);
  assert.equal(protectedSource.markdown.includes("$"), false);
  assert.deepEqual(protectedSource.formulas.get("GETGOMATHPLACEHOLDER1TOKEN"), {
    latex: array,
    inline: false,
  });
  assert.deepEqual(protectedSource.formulas.get("GETGOMATHPLACEHOLDER2TOKEN"), {
    latex: array,
    inline: false,
  });
});

test("protects a math token that omits the optional trailing hash", () => {
  const protectedSource = protectMarkdownMath(
    'Before #math:{"latex":"x^2 + 1","inline":true} after',
  );

  assert.equal(protectedSource.markdown, "Before GETGOMATHPLACEHOLDER0TOKEN after");
  assert.deepEqual(protectedSource.formulas.get("GETGOMATHPLACEHOLDER0TOKEN"), {
    latex: "x^2 + 1",
    inline: true,
  });
});
