import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  amcPaperTitle,
  amcQuizId,
  amcTopicId,
  extractChoiceMap,
  extractCorrectChoice,
  convertAopsText,
  aopsMarkdown,
  extractAopsQuestionText,
} from "../src/features/amc-import/domain/amc-import.js";
import { contentV2QuestionSchema, contentV2QuizSchema, contentV2TopicSchema } from "../src/features/topics/domain/content-v2.js";
import { AmcImportJobManager } from "../src/features/amc-import/main/amc-import-jobs.js";
import type { AmcImportService } from "../src/features/amc-import/main/amc-import-service.js";

test("AMC identifiers map to valid content-v2 topic and quiz IDs", () => {
  assert.equal(amcTopicId("AMC 10A"), "amc-10a");
  assert.equal(amcQuizId("AMC 10A", 2026), "amc-10a-2026");
  assert.equal(amcPaperTitle("AMC 10A", 2026), "2026_AMC_10A_Problems");
  assert.equal(amcTopicId("USA(J)MO"), "usa-j-mo");
});

test("extracts AoPS multiple-choice labels and values", () => {
  assert.deepEqual(extractChoiceMap("Find x. (A) 1 (B) $2^2$ (C) 5 (D) 6 (E) 7"), {
    A: "1", B: "$2^2$", C: "5", D: "6", E: "7",
  });
  assert.deepEqual(extractChoiceMap("Find x. \\textbf{(A) } 1 \\textbf{(B) } 2"), { A: "1", B: "2" });
  const formatted = String.raw`Problem $1-2+3= ?$ $\mathrm{\textbf{(A)} \ -50 } \qquad \mathrm{\textbf{(B)} \ 50 }$`;
  assert.deepEqual(extractChoiceMap(formatted), { A: "-50", B: "50" });
  assert.equal(extractAopsQuestionText(formatted), "Problem $1-2+3= ?$");
});

test("extracts the correct choice from any solution", () => {
  assert.equal(extractCorrectChoice([{ text: "Therefore the answer is (C)." }]), "C");
  assert.equal(extractCorrectChoice([{ text: "We obtain \\boxed{D}." }]), "D");
  assert.equal(extractCorrectChoice([{ text: "Thus \\boxed{\\textbf{(B)}}." }]), "B");
  assert.equal(extractCorrectChoice([{ text: "No final choice yet." }]), "");
  assert.equal(extractCorrectChoice([{ text: "50 \\Rightarrow \\mathrm{\\textbf{(E)}}" }]), "E");
});

test("converts AoPS math and Markdown to canonical GetGo tokens", () => {
  const converted = convertAopsText("Compute $1-2+3$ and $$S=50$$.");
  assert.match(converted, /#math:\{"latex":"1-2\+3","inline":true\}#/);
  assert.match(converted, /#math:\{"latex":"S=50","inline":false\}#/);
  assert.match(aopsMarkdown("## Solution\n\n$S=50$"), /^#md:/);
  assert.match(aopsMarkdown("## Solution\n\n$S=50$"), /#math:/);
});

test("AMC provenance and multiple solutions use typed content-v2 records", () => {
  const source = { provider: "AoPS", url: "https://artofproblemsolving.com/wiki/test", importedAt: "2026-10-01T00:00:00.000Z" };
  assert.equal(contentV2TopicSchema.parse({ schemaVersion: 2, id: "amc-8", type: "competition", title: "AMC 8", description: "", subject: "Mathematics", subjects: ["Mathematics"], grades: [8], rounds: [], gradeGroups: [], status: "draft", order: 0, source }).source?.provider, "AoPS");
  assert.equal(contentV2QuizSchema.parse({ schemaVersion: 2, id: "amc-8-2026", topicId: "amc-8", type: "competition-paper", title: "2026 AMC 8", description: "", supportedLanguages: ["en"], grade: "8", round: "amc-8", year: "2026", sharedCode: "", status: "draft", order: 0, source }).source?.url, source.url);
  const question = contentV2QuestionSchema.parse({ schemaVersion: 2, id: "q1", type: "competition-question", order: 0, status: "pending", text: { en: "Problem" }, assets: [], answer: { type: "input", correct: "1" }, source, solutions: [{ title: "Solution 1", text: "Proof" }] });
  assert.equal(question.type === "competition-question" ? question.solutions?.[0]?.text : undefined, "Proof");
});

test("AMC import jobs are persisted and run one at a time", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-amc-jobs-"));
  let active = 0;
  let maximumActive = 0;
  const service = {
    async start(_input: unknown, control: { setTotal(total: number, label: string): Promise<void>; report(label: string): Promise<void>; advance(label: string): Promise<void> }) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await control.setTotal(1, "One paper selected");
      await control.report("Parsing paper");
      await new Promise((resolve) => setTimeout(resolve, 20));
      await control.advance("Imported paper");
      active -= 1;
      return {};
    },
  } as unknown as AmcImportService;
  try {
    const manager = new AmcImportJobManager(directory, service);
    await Promise.all([
      manager.start({ scope: "quiz", contest: "AMC 8", year: 2024 }),
      manager.start({ scope: "quiz", contest: "AMC 8", year: 2025 }),
      manager.start({ scope: "quiz", contest: "AMC 8", year: 2026 }),
    ]);
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if ((await manager.list()).every((job) => job.status === "completed")) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const jobs = await manager.list();
    assert.equal(maximumActive, 1);
    assert.equal(jobs.length, 3);
    assert.ok(jobs.every((job) => job.status === "completed" && job.completed === 1));
    assert.ok(JSON.parse(await fs.readFile(path.join(directory, "amc-import-jobs.json"), "utf8")).jobs.length === 3);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
