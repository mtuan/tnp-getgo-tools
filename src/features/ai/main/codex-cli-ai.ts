import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  GetGoStructuredAiRequest,
  GetGoStructuredAiResponse,
} from "@tnp/getgo-logics/authoring";

const outputLimit = 10 * 1024 * 1024;

export class CodexCliAiProvider {
  private activeProcess: ChildProcessWithoutNullStreams | null = null;

  constructor(private readonly workspacePath: string) {}

  cancel() {
    this.activeProcess?.kill("SIGTERM");
  }

  async generate(request: GetGoStructuredAiRequest): Promise<GetGoStructuredAiResponse> {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-codex-question-"));
    const schemaPath = path.join(temporaryDirectory, "output-schema.json");
    const outputPath = path.join(temporaryDirectory, "proposal.json");
    await fs.writeFile(schemaPath, JSON.stringify(request.outputSchema));
    const prompt = [
      "$getgo-convert-static-quiz",
      "Generate a read-only dynamic-question proposal for the selected question below.",
      "The administrator explicitly requested conversion of this selected question, including it when it is image-dependent; preserve every image asset reference and do not infer image geometry.",
      "Follow the named skill and the supplied GetGo generation contract. Inspect repository code and nearby questions when useful.",
      "Do not edit, create, delete, or format any repository file. Return only the JSON proposal required by the output schema.",
      "",
      request.systemPrompt,
      "",
      JSON.stringify(request.payload),
    ].join("\n");
    try {
      const output = await this.runCodex(schemaPath, outputPath, prompt);
      return {
        output: JSON.parse(output) as unknown,
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

  private runCodex(schemaPath: string, outputPath: string, prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const quizRepository = path.resolve(this.workspacePath, "../tnp-getgo-quizzes");
      const child = spawn("codex", [
        "exec",
        "--ephemeral",
        "--sandbox", "read-only",
        "--cd", this.workspacePath,
        "--add-dir", quizRepository,
        "--output-schema", schemaPath,
        "--output-last-message", outputPath,
        "-",
      ], { stdio: ["pipe", "pipe", "pipe"] });
      this.activeProcess = child;
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGTERM"), 10 * 60_000);
      child.stdout.resume();
      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < outputLimit) stderr += chunk.toString();
      });
      child.on("error", (cause) => reject(new Error(`Codex CLI could not start: ${cause.message}`, { cause })));
      child.on("close", async (code, signal) => {
        clearTimeout(timer);
        if (this.activeProcess === child) this.activeProcess = null;
        if (signal === "SIGTERM") return reject(new Error("AI request cancelled."));
        if (code !== 0) return reject(new Error(stderr.trim() || `Codex CLI exited with code ${code}.`));
        try {
          resolve(await fs.readFile(outputPath, "utf8"));
        } catch (cause) {
          reject(new Error("Codex CLI did not return a dynamic-question proposal.", { cause }));
        }
      });
      child.stdin.end(prompt);
    });
  }
}
