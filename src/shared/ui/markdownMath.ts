import { parseMathText } from "@tnp/getgo-logics/quiz-builder";

export type ProtectedMarkdownMath = {
  markdown: string;
  formulas: ReadonlyMap<string, { latex: string; inline: boolean }>;
};

/** Hide LaTeX from Markdown, which otherwise consumes delimiters and row separators. */
export function protectMarkdownMath(value: string): ProtectedMarkdownMath {
  const formulas = new Map<string, { latex: string; inline: boolean }>();
  let index = 0;
  const markdown = parseMathText(value).map((segment) => {
    if (segment.type === "text") return segment.value;
    if (segment.type === "markdown") return segment.value.markdown;
    const marker = `GETGOMATHPLACEHOLDER${index}TOKEN`;
    index += 1;
    formulas.set(marker, segment.value);
    return marker;
  }).join("");
  return {
    markdown,
    formulas,
  };
}
