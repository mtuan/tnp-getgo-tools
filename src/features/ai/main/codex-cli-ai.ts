import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  GetGoStructuredAiRequest,
  GetGoStructuredAiResponse,
} from "@tnp/getgo-logics/authoring";

const outputLimit = 10 * 1024 * 1024;

type CodexRunResult = { output: string; sessionId?: string };

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
  private readonly sessions = new Map<string, string>();

  constructor(private readonly workspacePath: string) {}

  cancel() {
    this.activeProcess?.kill("SIGTERM");
  }

  async generate(request: GetGoStructuredAiRequest): Promise<GetGoStructuredAiResponse> {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-codex-question-"));
    const schemaPath = path.join(temporaryDirectory, "output-schema.json");
    const outputPath = path.join(temporaryDirectory, "proposal.json");
    await fs.writeFile(schemaPath, JSON.stringify(request.outputSchema));
    const contextKey = quizContextKey(request);
    const sessionId = contextKey ? this.sessions.get(contextKey) : undefined;
    const initialPrompt = [
      "$getgo-convert-static-quiz",
      "This is a shared, quiz-scoped dynamic-question authoring session. Keep the inspected repository conventions and quiz context available for later selected questions in this same session.",
      "Generate a read-only dynamic-question proposal for the first selected question below.",
      "The administrator explicitly requested conversion of this selected question, including it when it is image-dependent; preserve every image asset reference and do not infer image geometry.",
      "Follow the named skill and the supplied GetGo generation contract. Inspect repository code and nearby questions when useful.",
      "Do not edit, create, delete, or format any repository file. Return only the JSON proposal required by the output schema.",
      "",
      request.systemPrompt,
      "",
      JSON.stringify(request.payload),
    ].join("\n");
    const continuationPrompt = [
      "Generate a proposal for the next selected question in this quiz using the established skill, repository findings, and generation contract from this session.",
      "Treat this question independently. Do not use an earlier generated proposal as a precedent. Preserve image references and return only the required JSON proposal.",
      JSON.stringify(request.payload),
    ].join("\n");
    try {
      let result: CodexRunResult;
      try {
        result = await this.runCodex(schemaPath, outputPath, sessionId ? continuationPrompt : initialPrompt, sessionId);
      } catch (cause) {
        if (!sessionId || !sessionUnavailable(cause)) throw cause;
        this.sessions.delete(contextKey!);
        result = await this.runCodex(schemaPath, outputPath, initialPrompt);
      }
      if (contextKey && result.sessionId) this.sessions.set(contextKey, result.sessionId);
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
      const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
      child.stdout.on("data", (chunk: Buffer) => {
        if (stdout.length < outputLimit) stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < outputLimit) stderr += chunk.toString();
      });
      child.on("error", (cause) => reject(new Error(`Codex CLI could not start: ${cause.message}`, { cause })));
      child.on("close", async (code, signal) => {
        clearTimeout(timer);
        if (this.activeProcess === child) this.activeProcess = null;
        if (signal === "SIGTERM") return reject(new Error("AI request cancelled."));
        try {
          const output = await fs.readFile(outputPath, "utf8");
          JSON.parse(output);
          const threadEvent = stdout
            .split("\n")
            .map((line) => {
              try { return JSON.parse(line) as Record<string, unknown>; }
              catch { return null; }
            })
            .find((event) => event?.type === "thread.started" && typeof event.thread_id === "string");
          resolve({
            output,
            sessionId: typeof threadEvent?.thread_id === "string" ? threadEvent.thread_id : sessionId,
          });
        } catch (cause) {
          if (code !== 0) return reject(new Error(stderr.trim() || `Codex CLI exited with code ${code}.`, { cause }));
          reject(new Error("Codex CLI did not return a dynamic-question proposal.", { cause }));
        }
      });
      child.stdin.end(prompt);
    });
  }
}
