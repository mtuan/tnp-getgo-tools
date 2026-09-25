export interface DeclarationDetails {
  fileName: string;
  lineNumber: number;
  symbol: string;
  sections: Array<{ documentation: string; signature: string }>;
}

function documentationBefore(lines: string[], lineIndex: number): string {
  let end = lineIndex - 1;
  while (end >= 0 && !lines[end]?.trim()) end -= 1;
  if (end < 0 || !lines[end]?.trim().endsWith("*/")) return "";
  let start = end;
  while (start >= 0 && !lines[start]?.includes("/**")) start -= 1;
  if (start < 0) return "";
  return lines
    .slice(start, end + 1)
    .map((line) => line
      .replace(/^\s*\/\*\*?\s?/, "")
      .replace(/^\s*\*\/?\s?/, "")
      .replace(/\s*\*\/\s*$/, ""))
    .join("\n")
    .trim();
}

function declarationSymbol(line: string): string {
  return /(?:^|\s)([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\(/.exec(line)?.[1]
    ?? /(?:^|\s)([A-Za-z_$][\w$]*)\s*[?:]/.exec(line)?.[1]
    ?? "Declaration";
}

export function declarationDetailsAt(
  filePath: string,
  content: string,
  lineNumber: number,
): DeclarationDetails {
  const lines = content.split("\n");
  const targetIndex = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
  const symbol = declarationSymbol(lines[targetIndex] ?? "");
  const signaturePattern = new RegExp(`^\\s*(?:[A-Za-z ]+\\s+)?${symbol.replace(/[$]/g, "\\$")}\\s*(?:<[^>]+>)?\\s*\\(`);
  const matchingIndexes = lines
    .map((line, index) => signaturePattern.test(line) ? index : -1)
    .filter((index) => index >= 0);
  const indexes = matchingIndexes.length ? matchingIndexes : [targetIndex];
  return {
    fileName: filePath.split("/").at(-1) || filePath,
    lineNumber,
    symbol,
    sections: indexes.map((index) => ({
      documentation: documentationBefore(lines, index),
      signature: lines[index]?.trim() || "",
    })),
  };
}
