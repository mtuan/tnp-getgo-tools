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
}

export interface AmcImportPreview {
  sourceIndexUrl: string;
  sourcePaperUrl: string;
  topic: { id: string; title: string };
  quiz: { id: string; title: string; year: number; contest: AmcContestName };
  questions: AmcImportedQuestion[];
  warnings: string[];
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

export function extractChoiceMap(text: string): Record<string, string> {
  const normalized = text.replace(/\\textbf\s*\{\s*\(([A-E])\)\s*\}/g, "($1)");
  const matches = [...normalized.matchAll(/\(([A-E])\)\s*/g)];
  if (matches.length < 2) return {};
  return Object.fromEntries(matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    const raw = normalized.slice(start, end).replace(/\\q+uad[\s\S]*$/i, "");
    let value = raw
      .replace(/^\s*(?:\\[ ,;:!])+/, "")
      .trim()
      .replace(/\s+/g, " ");
    if (value.endsWith("$") && !value.startsWith("$")) value = value.slice(0, -1).trim();
    value = value.replace(/[}\s]+$/g, "").trim();
    return [match[1], /\\[A-Za-z]+/.test(value) ? `$${value}$` : value];
  }).filter(([, value]) => value.length > 0));
}

/** Remove the answer-choice block after choices have been extracted separately. */
export function extractAopsQuestionText(text: string): string {
  const normalized = text.replace(/\\textbf\s*\{\s*\(([A-E])\)\s*\}/g, "($1)");
  const labels = [...normalized.matchAll(/\(([A-E])\)\s*/g)];
  if (labels.length < 2) return text.trim();
  const firstLabel = labels[0].index ?? 0;
  const mathStart = normalized.lastIndexOf("$", firstLabel);
  return normalized.slice(0, mathStart >= 0 ? mathStart : firstLabel).trim();
}

export function extractCorrectChoice(solutions: Array<{ text: string }>): string {
  const source = solutions.map((solution) => solution.text).join("\n");
  return source.match(/\\boxed\s*\{(?:\s*\\textbf\s*\{)?\s*\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? source.match(/\\(?:Rightarrow|implies)[\s\S]{0,80}?\\(?:textbf|mathbf)\s*\{?\s*\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? source.match(/\\(?:textbf|mathbf)\s*\{\s*\(?([A-E])\)?\s*\}/i)?.[1]?.toUpperCase()
    ?? source.match(/(?:answer|choice)\s+(?:is\s+)?\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? "";
}

function mathToken(latex: string, inline: boolean): string {
  const normalized = latex
    .replace(/\\textbf\s*\(([^)]*)\)/g, "\\textbf{$1}")
    .trim();
  return `#math:${JSON.stringify({ latex: normalized, inline })}#`;
}

/** Convert AoPS MediaWiki math delimiters into GetGo's canonical KaTeX tokens. */
export function convertAopsText(value: string): string {
  const source = String(value ?? "");
  let output = "";
  let cursor = 0;
  const pattern = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\$([^$\n]+?)\$|\\\(([^\n]*?)\\\)/g;
  for (const match of source.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += source.slice(cursor, index);
    const display = match[1] !== undefined || match[2] !== undefined;
    output += mathToken(match[1] ?? match[2] ?? match[3] ?? match[4] ?? "", !display);
    cursor = index + match[0].length;
  }
  return output + source.slice(cursor);
}

export function aopsMarkdown(value: string): string {
  return `#md:${JSON.stringify({ markdown: convertAopsText(value) })}#`;
}
