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
  const matches = [...normalized.matchAll(/(?:^|\s)\(([A-E])\)\s*/g)];
  if (matches.length < 2) return {};
  return Object.fromEntries(matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? normalized.length;
    return [match[1], normalized.slice(start, end).trim().replace(/\s+/g, " ")];
  }).filter(([, value]) => value.length > 0));
}

export function extractCorrectChoice(solutions: Array<{ text: string }>): string {
  const source = solutions.map((solution) => solution.text).join("\n");
  return source.match(/\\boxed\s*\{(?:\s*\\textbf\s*\{)?\s*\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? source.match(/(?:answer|choice)\s+(?:is\s+)?\(?([A-E])\)?/i)?.[1]?.toUpperCase()
    ?? "";
}
