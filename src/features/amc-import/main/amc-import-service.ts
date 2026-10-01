import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  amcIndexUrl,
  amcQuizId,
  amcTopicId,
  type AmcArchiveEntry,
  type AmcContestName,
  type AmcImportDashboard,
  type AmcImportLogEntry,
  type AmcImportPreview,
  type AmcPaperImportProgress,
  type StartAmcImportInput,
} from "../domain/amc-import.js";
import { discoverAmcArchive, previewAmcPaper, reparseAmcPreview } from "./amc-browser.js";
import { amcQuizExists, importAmcPreview } from "./amc-import-repository.js";

interface StoredPaper extends AmcArchiveEntry { status?: AmcPaperImportProgress["status"]; questionCount?: number; processedQuestions?: number; totalQuestions?: number; error?: string; updatedAt?: string }
interface StoredState { archiveLoadedAt?: string; active?: AmcImportDashboard["active"]; papers: StoredPaper[]; logs?: AmcImportLogEntry[] }

const paperId = (contest: AmcContestName, year: number) => `${amcTopicId(contest)}-${year}`;
export interface AmcImportRunControl {
  checkpoint(): Promise<void>;
  setTotal(total: number, label: string): Promise<void>;
  setProgress(completed: number, total: number, label: string): Promise<void>;
  report(label: string): Promise<void>;
  advance(label: string): Promise<void>;
}

export class AmcImportService {
  private running = false;
  constructor(private readonly repositoryRoot: () => Promise<string>, private readonly userDataPath = process.cwd()) {}

  private async directory(root: string) {
    const key = createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
    return path.join(this.userDataPath, "amc-import", key);
  }
  private async statePath(root: string) { return path.join(await this.directory(root), "state.json"); }
  private async previewPath(root: string, contest: AmcContestName, year: number) { return path.join(await this.directory(root), "previews", `${paperId(contest, year)}.json`); }
  private async read(root: string): Promise<StoredState> {
    return fs.readFile(await this.statePath(root), "utf8").then((value) => JSON.parse(value) as StoredState).catch(() => ({ papers: [] }));
  }
  private async write(root: string, state: StoredState): Promise<void> {
    const file = await this.statePath(root);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
  }
  private log(state: StoredState, level: AmcImportLogEntry["level"], message: string, detail?: string): void {
    state.logs = [...(state.logs ?? []), { at: new Date().toISOString(), level, message, detail }].slice(-100);
  }
  private async cachedPreview(root: string, paper: StoredPaper): Promise<AmcImportPreview | null> {
    return fs.readFile(await this.previewPath(root, paper.contest, paper.year), "utf8").then((value) => JSON.parse(value) as AmcImportPreview).catch(() => null);
  }
  private async savePreview(root: string, preview: AmcImportPreview): Promise<void> {
    const file = await this.previewPath(root, preview.quiz.contest, preview.quiz.year);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(preview, null, 2), "utf8");
  }
  private summarize(papers: AmcPaperImportProgress[], state: StoredState): AmcImportDashboard {
    const contests = [...new Set(papers.map((paper) => paper.contest))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
    const topics = contests.map((contest) => {
      const items = papers.filter((paper) => paper.contest === contest).sort((a, b) => b.year - a.year);
      const parsed = items.filter((paper) => paper.parsed).length;
      const imported = items.filter((paper) => paper.imported).length;
      return { contest, papers: items, total: items.length, parsed, imported, remaining: items.length - imported };
    });
    const parsed = papers.filter((paper) => paper.parsed).length;
    const imported = papers.filter((paper) => paper.imported).length;
    return { sourceUrl: amcIndexUrl, archiveLoadedAt: state.archiveLoadedAt, active: state.active, topics, total: papers.length, parsed, imported, remaining: papers.length - imported, logs: state.logs ?? [] };
  }
  private async dashboardFrom(root: string, state: StoredState): Promise<AmcImportDashboard> {
    const papers = await Promise.all(state.papers.map(async (paper): Promise<AmcPaperImportProgress> => {
      const imported = await amcQuizExists(root, amcTopicId(paper.contest), amcQuizId(paper.contest, paper.year));
      const cached = await this.cachedPreview(root, paper);
      const status = imported ? "imported"
        : paper.status === "failed" ? "failed"
          : this.running && (paper.status === "parsing" || paper.status === "importing") ? paper.status
            : cached ? "parsed" : "pending";
      const questionCount = cached?.questions.length ?? paper.questionCount ?? 0;
      return { ...paper, id: paperId(paper.contest, paper.year), status, parsed: Boolean(cached), imported, questionCount, processedQuestions: cached ? questionCount : paper.processedQuestions ?? 0, totalQuestions: cached ? questionCount : paper.totalQuestions ?? 0 };
    }));
    return this.summarize(papers, state);
  }
  async dashboard(refreshArchive = false): Promise<AmcImportDashboard> {
    const root = await this.repositoryRoot();
    let state = await this.read(root);
    if (state.active && !this.running) {
      state = { ...state, active: undefined, papers: state.papers.map((paper) => ["parsing", "importing"].includes(paper.status ?? "") ? { ...paper, status: "failed", error: "Import was interrupted when GetGo Tools stopped." } : paper) };
      await this.write(root, state);
    }
    // The first visit should be useful without requiring the user to discover
    // that "Refresh archive" is the setup action. Cached archives are kept for
    // later visits; an explicit refresh still re-runs discovery.
    if (refreshArchive || (!state.archiveLoadedAt && state.papers.length === 0)) {
      this.log(state, "info", refreshArchive ? "Archive discovery started by user." : "Initial archive discovery started.", amcIndexUrl);
      await this.write(root, state);
      try {
        const entries = await discoverAmcArchive();
        const previous = new Map(state.papers.map((paper) => [paperId(paper.contest, paper.year), paper]));
        state = { ...state, archiveLoadedAt: new Date().toISOString(), papers: entries.map((entry) => ({ ...entry, ...previous.get(paperId(entry.contest, entry.year)), ...entry })) };
        this.log(state, "success", `Archive discovery completed: ${entries.length} quizzes across ${new Set(entries.map((entry) => entry.contest)).size} contests.`);
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        this.log(state, "error", "Archive discovery failed.", detail);
      }
      await this.write(root, state);
    }
    return this.dashboardFrom(root, state);
  }
  async start(value: unknown, control?: AmcImportRunControl): Promise<AmcImportDashboard> {
    const input = value as StartAmcImportInput;
    if (!input || !["quiz", "topic", "all"].includes(input.scope)) throw new Error("Invalid AMC import scope.");
    if (input.scope !== "all" && (!input.contest || typeof input.contest !== "string" || input.contest.length > 80)) throw new Error("Select an AMC contest.");
    if (input.scope === "quiz" && !Number.isInteger(input.year)) throw new Error("Select an AMC paper year.");
    if (this.running) throw new Error("An AMC import is already running.");
    const root = await this.repositoryRoot();
    const state = await this.read(root);
    const selected = state.papers.filter((paper) => input.scope === "all" || (paper.contest === input.contest && (input.scope === "topic" || paper.year === input.year)));
    if (!selected.length) throw new Error("No AMC papers match this import selection. Load the archive first.");
    await control?.setProgress(0, 0, `${selected.length} AMC ${selected.length === 1 ? "quiz" : "quizzes"} selected`);
    this.running = true;
    let failedPapers = 0;
    state.active = { scope: input.scope, contest: input.contest, year: input.year };
    await this.write(root, state);
    try {
      let completedQuestions = 0;
      let discoveredQuestions = 0;
      for (const paper of selected) {
        await control?.checkpoint();
        if (!input.overwrite && await amcQuizExists(root, amcTopicId(paper.contest), amcQuizId(paper.contest, paper.year))) {
          await control?.advance(`Skipped ${paper.title} · already imported`);
          continue;
        }
        state.active.current = paper.title;
        paper.status = "parsing"; paper.error = undefined; paper.updatedAt = new Date().toISOString();
        await this.write(root, state);
        await control?.report(`Parsing ${paper.title}`);
        try {
          let preview = await this.cachedPreview(root, paper);
          await control?.report(preview?.rawSource?.questions.length
            ? `Reparsing ${paper.title} from saved source content`
            : `Fetching and saving original source content for ${paper.title}`);
          let paperTotalKnown = false;
          const updateParseProgress = async ({ processed, total }: { processed: number; total: number }) => {
              if (!paperTotalKnown) {
                discoveredQuestions += total;
                paperTotalKnown = true;
              }
              paper.processedQuestions = processed; paper.totalQuestions = total; paper.updatedAt = new Date().toISOString();
              await this.write(root, state);
              await control?.setProgress(completedQuestions + processed, discoveredQuestions, `${paper.title} · parsed ${processed}/${total} questions`);
              await control?.checkpoint();
          };
          preview = preview?.rawSource?.questions.length
            ? await reparseAmcPreview(preview, updateParseProgress)
            : await previewAmcPaper(paper.contest, paper.year, updateParseProgress);
          await this.savePreview(root, preview);
          if (!paperTotalKnown) discoveredQuestions += preview.questions.length;
          completedQuestions += preview.questions.length;
          await control?.setProgress(completedQuestions, discoveredQuestions, `${paper.title} · parsed ${preview.questions.length}/${preview.questions.length} questions`);
          paper.status = "importing"; paper.questionCount = preview.questions.length; paper.updatedAt = new Date().toISOString();
          await this.write(root, state);
          await control?.report(`Writing ${paper.title} to Topics`);
          await importAmcPreview(root, preview, input.overwrite === true);
          paper.status = "imported"; paper.error = undefined; paper.updatedAt = new Date().toISOString();
          await control?.report(`Imported ${paper.title} · ${preview.questions.length} questions`);
        } catch (cause) {
          failedPapers += 1;
          paper.status = "failed"; paper.error = cause instanceof Error ? cause.message : String(cause); paper.updatedAt = new Date().toISOString();
          await control?.report(`Failed ${paper.title}: ${paper.error}`);
        }
        await this.write(root, state);
      }
      if (failedPapers) throw new Error(`${failedPapers} of ${selected.length} AMC ${selected.length === 1 ? "quiz" : "quizzes"} failed. Open the job log for details.`);
    } finally {
      state.active = undefined; this.running = false; await this.write(root, state);
    }
    return this.dashboardFrom(root, state);
  }
}
