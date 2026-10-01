/** Preserve standard LaTeX delimiters before React Markdown consumes their backslashes. */
export function protectMarkdownMath(value: string): string {
  return value
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, latex: string) => `$$${latex.trim()}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, latex: string) => `$${latex.trim()}$`);
}
