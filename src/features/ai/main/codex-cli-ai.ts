import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  GetGoStructuredAiRequest,
  GetGoStructuredAiResponse,
} from "@tnp/getgo-logics/authoring";

const outputLimit = 10 * 1024 * 1024;
const maxSharedSessionTurns = 12;
const outputReadyRetries = 10;
const outputReadyDelayMs = 20;
const outputPollIntervalMs = 100;

type CodexRunResult = { output: string; sessionId?: string };
type SharedSession = { id: string; turns: number };

const sharedSessions = new Map<string, SharedSession>();
const sharedSessionQueues = new Map<string, Promise<void>>();

export class CodexEventCollector {
  private remainder = "";
  threadId?: string;
  errorMessage?: string;

  private inspect(line: string): boolean | null {
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; }
    catch { return null; }
    if (event.type === "thread.started" && typeof event.thread_id === "string")
      this.threadId = event.thread_id;
    if (event.type === "error" && typeof event.message === "string")
      this.errorMessage = event.message;
    if (event.type === "turn.failed" && event.error && typeof event.error === "object") {
      const message = (event.error as Record<string, unknown>).message;
      if (typeof message === "string") this.errorMessage = message;
    }
    return event.type === "turn.completed";
  }

  push(chunk: string): boolean {
    const lines = `${this.remainder}${chunk}`.split("\n");
    this.remainder = lines.pop() ?? "";
    let completed = false;
    for (const line of lines) {
      if (this.inspect(line)) completed = true;
    }
    const finalEvent = this.inspect(this.remainder);
    if (finalEvent !== null) this.remainder = "";
    if (finalEvent) completed = true;
    return completed;
  }
}

async function readCompletedOutput(outputPath: string): Promise<string> {
  let lastCause: unknown;
  for (let attempt = 0; attempt < outputReadyRetries; attempt += 1) {
    try {
      const output = await fs.readFile(outputPath, "utf8");
      JSON.parse(output);
      return output;
    } catch (cause) {
      lastCause = cause;
      await new Promise(resolve => setTimeout(resolve, outputReadyDelayMs));
    }
  }
  throw lastCause;
}

async function inSharedSession<T>(
  contextKey: string | null,
  action: () => Promise<T>,
): Promise<T> {
  if (!contextKey) return action();
  const previous = sharedSessionQueues.get(contextKey) ?? Promise.resolve();
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => pending);
  sharedSessionQueues.set(contextKey, queued);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release();
    if (sharedSessionQueues.get(contextKey) === queued)
      sharedSessionQueues.delete(contextKey);
  }
}

function quizContextKey(request: GetGoStructuredAiRequest): string | null {
  const payload = request.payload as Record<string, unknown>;
  const context = payload.context;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const value = context as Record<string, unknown>;
  return typeof value.contestId === "string" && typeof value.quizId === "string"
    ? `${value.contestId}/${value.quizId}`
    : null;
}

function sessionUnavailable(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message.toLowerCase() : "";
  return message.includes("session") && (
    message.includes("not found") ||
    message.includes("does not exist") ||
    message.includes("could not resume")
  );
}

export class CodexCliAiProvider {
  private activeProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly workspacePath: string) {}

  cancel() {
    this.activeProcess?.kill("SIGTERM");
  }

  async generate(request: GetGoStructuredAiRequest): Promise<GetGoStructuredAiResponse> {
    const contextKey = quizContextKey(request);
    return inSharedSession(contextKey, () => this.generateInSession(request, contextKey));
  }

  private async generateInSession(
    request: GetGoStructuredAiRequest,
    contextKey: string | null,
  ): Promise<GetGoStructuredAiResponse> {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-codex-question-"));
    const schemaPath = path.join(temporaryDirectory, "output-schema.json");
    const outputPath = path.join(temporaryDirectory, "proposal.json");
    await fs.writeFile(schemaPath, JSON.stringify(request.outputSchema));
    const sharedSession = contextKey ? sharedSessions.get(contextKey) : undefined;
    const sessionId = sharedSession && sharedSession.turns < maxSharedSessionTurns
      ? sharedSession.id
      : undefined;
    if (contextKey && sharedSession && !sessionId) sharedSessions.delete(contextKey);
    const isFix = request.promptCacheKey.startsWith("getgo-qb-fix");
    const initialPrompt = [
      "$getgo-convert-static-quiz",
      "This is a shared, quiz-scoped dynamic-question authoring session. Keep the inspected repository conventions and quiz context available for later selected questions in this same session.",
      isFix
        ? "Fix the existing dynamic-question proposal below according to the administrator's instructions and supplied diagnostics."
        : "Generate a read-only dynamic-question proposal for the first selected question below.",
      isFix
        ? "Preserve correct existing behavior and change only what is required to resolve the requested problem."
        : "The administrator explicitly requested conversion of this selected question, including it when it is image-dependent; preserve every image asset reference and do not infer image geometry.",
      "Follow the named skill and the supplied GetGo generation contract. Inspect repository code and nearby questions when useful.",
      "Do not edit, create, delete, or format any repository file. Return only the JSON proposal required by the output schema.",
      "",
      request.systemPrompt,
      "",
      JSON.stringify(request.payload),
    ].join("\n");
    const continuationPrompt = [
      isFix
        ? "Fix this existing dynamic-question proposal using the established skill, repository findings, and generation contract from this quiz session."
        : "Generate a proposal for the next selected question in this quiz using the established skill, repository findings, and generation contract from this session.",
      isFix
        ? "Apply the administrator's instructions and supplied diagnostics, preserve correct behavior, and return only the required JSON fix proposal."
        : "Treat this question independently. Do not use an earlier generated proposal as a precedent. Preserve image references and return only the required JSON proposal.",
      JSON.stringify(request.payload),
    ].join("\n");
    try {
      let result: CodexRunResult;
      try {
        result = await this.runCodex(schemaPath, outputPath, sessionId ? continuationPrompt : initialPrompt, sessionId);
      } catch (cause) {
        if (!sessionId || !sessionUnavailable(cause)) throw cause;
        sharedSessions.delete(contextKey!);
        result = await this.runCodex(schemaPath, outputPath, initialPrompt);
      }
      if (contextKey && result.sessionId) sharedSessions.set(contextKey, {
        id: result.sessionId,
        turns: sessionId ? (sharedSession?.turns ?? 0) + 1 : 1,
      });
      return {
        output: JSON.parse(result.output) as unknown,
        model: "codex-cli",
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          cachedInputTokens: 0,
          cacheWriteTokens: 0,
        },
      };
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private runCodex(schemaPath: string, outputPath: string, prompt: string, sessionId?: string): Promise<CodexRunResult> {
    return new Promise((resolve, reject) => {
      const quizRepository = path.resolve(this.workspacePath, "../tnp-getgo-quizzes");
      const sharedArguments = [
        "--json",
        "--output-schema", schemaPath,
        "--output-last-message", outputPath,
        "-",
      ];
      const argumentsForRun = sessionId
        ? ["exec", "resume", sessionId, ...sharedArguments]
        : [
            "exec",
            "--sandbox", "read-only",
            "--cd", this.workspacePath,
            "--add-dir", quizRepository,
            ...sharedArguments,
          ];
      const child = spawn("codex", argumentsForRun, { stdio: ["pipe", "pipe", "pipe"] });
      this.activeProcess = child;
      let stderr = "";
      let stdout = "";
      let settled = false;
      let checkingOutput = false;
      const events = new CodexEventCollector();
      const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
      const finish = (output: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(outputPoll);
        resolve({ output, sessionId: events.threadId ?? sessionId });
        child.kill("SIGTERM");
      };
      const finishFromOutput = async () => {
        if (settled || checkingOutput) return;
        checkingOutput = true;
        try {
          const output = await fs.readFile(outputPath, "utf8");
          JSON.parse(output);
          finish(output);
        } catch {
          // The output file is absent or incomplete while Codex is still working.
        } finally {
          checkingOutput = false;
        }
      };
      const outputPoll = setInterval(() => void finishFromOutput(), outputPollIntervalMs);
      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (stdout.length < outputLimit) stdout += text;
        if (!settled && events.push(text)) void finishFromOutput();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < outputLimit) stderr += chunk.toString();
      });
      child.on("error", (cause) => {
        if (!settled) reject(new Error(`Codex CLI could not start: ${cause.message}`, { cause }));
      });
      child.on("close", async (code, signal) => {
        clearTimeout(timer);
        clearInterval(outputPoll);
        if (this.activeProcess === child) this.activeProcess = null;
        if (settled) return;
        if (signal === "SIGTERM") return reject(new Error("AI request cancelled."));
        try {
          const output = await readCompletedOutput(outputPath);
          settled = true;
          resolve({
            output,
            sessionId: events.threadId ?? sessionId,
          });
        } catch (cause) {
          if (code !== 0) return reject(new Error(stderr.trim() || events.errorMessage || `Codex CLI exited with code ${code}.`, { cause }));
          reject(new Error("Codex CLI did not return a dynamic-question proposal.", { cause }));
        }
      });
      child.stdin.end(prompt);
    });
  }
}
