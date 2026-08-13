import type { IpcMain } from "electron";
import type { QuizQuestionRecord } from "../core/models.js";
import type { AiMigrationJobManager } from "./ai-migration-jobs.js";
import type { LocalAiService } from "./local-ai.js";

async function run<T>(operation: "generate" | "fix", action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    console.error(`[GetGo Tools][AI IPC][${operation}] ${error.message}`);
    if (error.stack) console.error(error.stack);
    throw error;
  }
}

export function registerAiIpc(ipcMain: IpcMain, localAi: LocalAiService, jobs: AiMigrationJobManager) {
  ipcMain.handle("ai:dynamic-question", (_event, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid AI request.");
    const value = input as Record<string, unknown>;
    if (!value.question || typeof value.question !== "object" || Array.isArray(value.question)) throw new Error("A local question record is required.");
    if (value.context !== undefined && (!value.context || typeof value.context !== "object" || Array.isArray(value.context))) throw new Error("AI context must be an object.");
    if (value.instructions !== undefined && typeof value.instructions !== "string") throw new Error("AI instructions must be text.");
    return run("generate", () => localAi.createDynamicQuestionProposal(value as { question: QuizQuestionRecord; context?: Record<string, unknown>; instructions?: string }));
  });
  ipcMain.handle("ai:fix-dynamic-question", (_event, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid AI fix request.");
    const value = input as Record<string, unknown>;
    if (!value.originalQuestion || typeof value.originalQuestion !== "object" || Array.isArray(value.originalQuestion)) throw new Error("The immutable original question is required.");
    if (!value.currentCode || typeof value.currentCode !== "object" || Array.isArray(value.currentCode)) throw new Error("Current question code is required.");
    if (!value.currentSummary || typeof value.currentSummary !== "object" || Array.isArray(value.currentSummary)) throw new Error("Current AI summary is required.");
    if (typeof value.instructions !== "string" || !value.instructions.trim()) throw new Error("Fix instructions are required.");
    return run("fix", () => localAi.fixDynamicQuestion(value as Parameters<typeof localAi.fixDynamicQuestion>[0]));
  });
  ipcMain.handle("ai:cancel-dynamic-question", () => localAi.cancelDynamicQuestionAi());
  ipcMain.handle("ai-migration:start", (_event, input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Invalid AI migration job.");
    const value = input as Record<string, unknown>;
    if (typeof value.manifestPath !== "string" || !value.context || typeof value.context !== "object" || Array.isArray(value.context)) throw new Error("A quiz manifest and context are required.");
    return jobs.start(value as { manifestPath: string; context: Record<string, unknown> });
  });
  ipcMain.handle("ai-migration:list", () => jobs.list());
  ipcMain.handle("ai-migration:concurrency", (_event, concurrency: unknown) => {
    if (typeof concurrency !== "number" || !Number.isInteger(concurrency)) throw new Error("Invalid job concurrency.");
    return jobs.setConcurrency(concurrency);
  });
  ipcMain.handle("ai-migration:cancel", (_event, jobId: unknown) => {
    if (typeof jobId !== "string") throw new Error("Invalid migration job.");
    return jobs.cancel(jobId);
  });
}
