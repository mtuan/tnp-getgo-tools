export const amcContestNames = ["AMC 8", "AMC 10A", "AMC 10B", "AMC 12A", "AMC 12B"] as const;
export type AmcContestName = string;

export interface AmcArchiveEntry {
  contest: AmcContestName;
  year: number;
  title: string;
  url: string;
}

export interface AmcImportedQuestion {
  id: string;
  number: number;
  sourceUrl: string;
  text: string;
  choices: Record<string, string>;
  correct: string;
  solutions: Array<{ title: string; text: string }>;
  imageUrls?: string[];
  choiceImageUrls?: Record<string, string>;
}

export interface AmcImportPreview {
  sourceIndexUrl: string;
  sourcePaperUrl: string;
  topic: { id: string; title: string };
  quiz: { id: string; title: string; year: number; contest: AmcContestName };
  questions: AmcImportedQuestion[];
  warnings: string[];
  rawSource?: {
    capturedAt: string;
    questions: Array<{ number: number; sourceUrl: string; html: string }>;
  };
}

export interface AmcImportResult {
  topicId: string;
  quizId: string;
  questionCount: number;
  route: string;
}

export type AmcPaperImportStatus = "pending" | "parsing" | "parsed" | "importing" | "imported" | "failed";
export interface AmcPaperImportProgress extends AmcArchiveEntry {
  id: string;
  status: AmcPaperImportStatus;
  parsed: boolean;
  imported: boolean;
  questionCount: number;
  processedQuestions: number;
  totalQuestions: number;
  error?: string;
  updatedAt?: string;
}
export interface AmcTopicImportProgress {
  contest: AmcContestName;
  papers: AmcPaperImportProgress[];
  total: number;
  parsed: number;
  imported: number;
  remaining: number;
}
export interface AmcImportLogEntry {
  at: string;
  level: "info" | "success" | "error";
  message: string;
  detail?: string;
}
export interface AmcImportDashboard {
  sourceUrl: string;
  archiveLoadedAt?: string;
  active?: { scope: "quiz" | "topic" | "all"; contest?: AmcContestName; year?: number; current?: string };
  topics: AmcTopicImportProgress[];
  total: number;
  parsed: number;
  imported: number;
  remaining: number;
  logs: AmcImportLogEntry[];
}
export interface StartAmcImportInput {
  scope: "quiz" | "topic" | "all";
  contest?: AmcContestName;
  year?: number;
  overwrite?: boolean;
}

export interface AmcImportDesktopApi {
  discoverAmcArchive(): Promise<AmcArchiveEntry[]>;
  previewAmcPaper(contest: AmcContestName, year: number): Promise<AmcImportPreview>;
  importAmcPaper(preview: AmcImportPreview, overwrite: boolean): Promise<AmcImportResult>;
  loadAmcImportDashboard(refreshArchive?: boolean): Promise<AmcImportDashboard>;
  startAmcImport(input: StartAmcImportInput): Promise<AmcImportDashboard>;
}

export const amcIndexUrl = "https://artofproblemsolving.com/wiki/index.php?title=AMC_Problems_and_Solutions";

export function amcPaperTitle(contest: AmcContestName, year: number): string {
  return `${year}_${contest.replaceAll(" ", "_")}_Problems`;
}

export function amcPaperUrl(contest: AmcContestName, year: number): string {
  return `https://artofproblemsolving.com/wiki/index.php?title=${encodeURIComponent(amcPaperTitle(contest, year))}`;
}

export function amcTopicId(contest: AmcContestName): string {
  const slug = contest.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return /^[a-z]/.test(slug) ? slug : `contest-${slug || "amc"}`;
}

export function amcQuizId(contest: AmcContestName, year: number): string {
  return `${amcTopicId(contest)}-${year}`;
}

export function amcContestGrade(contest: AmcContestName): number {
  return Number(contest.match(/AMC\s*(8|10|12)/i)?.[1] ?? 12);
}

function removeUnmatchedBoundaryBraces(value: string): string {
  const balance = (source: string) => {
    let result = 0;
    for (let index = 0; index < source.length; index += 1) {
      if (source[index - 1] === "\\") continue;
      if (source[index] === "{") result += 1;
      else if (source[index] === "}") result -= 1;
    }
    return result;
  };
  let normalized = value;
  while (normalized.startsWith("}") && balance(normalized) < 0)
    normalized = normalized.slice(1).trimStart();
  while (normalized.endsWith("}") && balance(normalized) < 0)
    normalized = normalized.slice(0, -1).trimEnd();
  return normalized;
}

function isInsideMath(source: string, targetIndex: number): boolean {
  let delimiter: "$" | "$$" | null = null;
  for (let index = 0; index < targetIndex; index += 1) {
    if (source[index] !== "$" || source[index - 1] === "\\") continue;
    const token = source[index + 1] === "$" ? "$$" : "$";
    if (token === "$$") index += 1;
    if (delimiter === token) delimiter = null;
    else if (delimiter === null) delimiter = token;
  }
  return delimiter !== null;
}

function normalizeExtractedChoice(source: string, inheritedMath: boolean): string {
  const value = source.replace(/^(?:\\\s+)+/, "").trimStart();
  if (/^\[\[getgo-aops-image:[^\]]+\]\]$/.test(value)) return value;
  const explicitlyWrapped = value.startsWith("$") && value.endsWith("$");
  const unwrapped = explicitlyWrapped ? value.slice(1, -1).trim() : value;
  const possibleText = unwrapped
    .replace(/^(?:\\hspace\s*\{[^{}]*\}\s*)+/, "")
    .replace(/\s*\\(?:\]|\))\s*$/, "")
    .replace(/\s*\\\\\s*$/, "")
    .replace(/(?:\s*\\hspace\s*\{[^{}]*\})+\s*$/, "")
    .trim();
  const pureText = possibleText.match(/^\\text\s*\{([\s\S]*)\}$/);
  if (pureText)
    return pureText[1].replace(/\\(?=\s)/g, "").replace(/\s+/g, " ").trim();
  if (/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(possibleText))
    return possibleText;
  if (possibleText.includes("$")) return possibleText;
  if (/\\\s/.test(possibleText) && !/\\(?!\s)/.test(possibleText))
    return possibleText.replace(/\\(?=\s)/g, "").replace(/\s+/g, " ").trim();
  return explicitlyWrapped || inheritedMath || /\\(?:[A-Za-z]+|[%$#&_{}])/.test(possibleText)
    ? `$${possibleText}$`
    : possibleText;
}

function normalizeChoiceLabels(value: string): string {
  return value
    .replace(/\\textbf\s*\{\s*\(([A-E])\)\s*\}/g, "($1)")
    .replace(/\\textbf\s*\{\s*([A-E])\s*[.)]\s*\}/g, "($1)");
}

export function extractChoiceMap(text: string): Record<string, string> {
  const normalized = normalizeChoiceLabels(text);
  const allMatches = [...normalized.matchAll(/\(([A-E])\)\s*/g)];
  const firstA = allMatches.findIndex((match) => match[1] === "A");
  if (firstA < 0) return {};
  const matches = allMatches.slice(firstA, firstA + 5).filter(
    (match, index) => match[1] === String.fromCharCode(65 + index),
  );
  if (matches.length < 2) return {};
  return Object.fromEntries(matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index
      ?? allMatches[firstA + matches.length]?.index
      ?? normalized.length;
    let raw = normalized.slice(start, end)
      .replace(/\\q+uad[\s\S]*$/i, "")
      .replace(/\s*\$?\s*\\(?:mathrm|textrm|mathbf|textbf)\s*\{?\s*$/i, "");
    if (index === matches.length - 1)
      raw = raw.replace(/\s*(?:=\s*(?:Video\s+)?Solutions?(?:\s+\d+)?|(?:Video\s+)?Solutions(?:\s+\d+)?)(?:\s|$)[\s\S]*$/i, "");
    let value = raw
      .replace(/^\s*(?:(?:\\[ ,;:!])\s*)+}?\s*/, "")
      .trim()
      .replace(/\s+/g, " ");
    if (value.endsWith("$") && !value.startsWith("$")) value = value.slice(0, -1).trim();
    value = removeUnmatchedBoundaryBraces(value).trim();
    return [match[1], normalizeExtractedChoice(value, isInsideMath(normalized, match.index ?? 0))];
  }).filter(([, value]) => value.length > 0));
}

function normalizeAopsQuestionText(value: string): string {
  let normalized = value
    .replace(/^\s*Problem(?:\s+\d+)?\s*/i, "")
    .replace(/\s+\$\s*$/, "")
    .trim();
  const dollars = [...normalized.matchAll(/(?<!\\)\$/g)];
  if (dollars.length % 2 === 1)
    normalized = normalized.replace(/\$(\d+(?:\.\d+)?)(?=\s+[A-Za-z])/g, (_match, amount: string) => `\\$${amount}`);
  return normalized;
}

/** Remove the answer-choice block after choices have been extracted separately. */
export function extractAopsQuestionText(text: string): string {
  const normalized = normalizeChoiceLabels(text);
  const labels = [...normalized.matchAll(/\(([A-E])\)\s*/g)];
  if (labels.length < 2) return normalizeAopsQuestionText(text);
  const firstLabel = labels[0].index ?? 0;
  const prefix = normalized.slice(0, firstLabel);
  const mathPrefix = prefix.replace(/\$(?=\d+(?:\.\d+)?\s+[A-Za-z])/g, "¤");
  const candidates: number[] = [];
  if (isInsideMath(mathPrefix, mathPrefix.length)) {
    const dollarStarts = [...mathPrefix.matchAll(/(?<!\\)\$\$?/g)];
    const dollarStart = dollarStarts.at(-1)?.index;
    if (typeof dollarStart === "number") candidates.push(dollarStart);
  }
  const displayStart = prefix.lastIndexOf("\\[");
  if (displayStart > prefix.lastIndexOf("\\]")) candidates.push(displayStart);
  const inlineStart = prefix.lastIndexOf("\\(");
  if (inlineStart > prefix.lastIndexOf("\\)")) candidates.push(inlineStart);
  const optionBlockStart = candidates.length ? Math.max(...candidates) : firstLabel;
  return normalizeAopsQuestionText(normalized.slice(0, optionBlockStart));
}

export function extractCorrectChoice(solutions: Array<{ text: string }>): string {
  const source = solutions.map((solution) => solution.text).join("\n");
  return source.match(/\\boxed\s*\{(?:\s*\\(?:textbf|mathbf|text|mathrm|textrm)\s*\{)?\s*\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? source.match(/\\(?:Rightarrow|implies)[\s\S]{0,80}?\\(?:textbf|mathbf|mathrm|textrm)\s*\{?\s*\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? source.match(/\\(?:textbf|mathbf|mathrm|textrm)\s*\{\s*\(?([A-E])\)?\s*\}/i)?.[1]?.toUpperCase()
    ?? source.match(/(?:answer|choice)\s+(?:is\s+)?\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? "";
}
