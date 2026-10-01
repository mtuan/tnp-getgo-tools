import assert from "node:assert/strict";
import test from "node:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  amcPaperTitle,
  amcContestGrade,
  amcQuizId,
  amcTopicId,
  extractChoiceMap,
  extractCorrectChoice,
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
  assert.equal(amcContestGrade("AMC 8"), 8);
  assert.equal(amcContestGrade("AMC 10A"), 10);
  assert.equal(amcContestGrade("AMC 12B"), 12);
  assert.equal(amcContestGrade("AHSME"), 12);
});

test("extracts AoPS multiple-choice labels and values", () => {
  assert.deepEqual(extractChoiceMap("Find x. (A) 1 (B) $2^2$ (C) 5 (D) 6 (E) 7"), {
    A: "1", B: "$2^2$", C: "5", D: "6", E: "7",
  });
  assert.deepEqual(extractChoiceMap("Find x. \\textbf{(A) } 1 \\textbf{(B) } 2"), { A: "1", B: "2" });
  const formatted = String.raw`Problem $1-2+3= ?$ $\mathrm{\textbf{(A)} \ -50 } \qquad \mathrm{\textbf{(B)} \ 50 }$`;
  assert.deepEqual(extractChoiceMap(formatted), { A: "-50", B: "50" });
  assert.equal(extractAopsQuestionText(formatted), "$1-2+3= ?$");
  const duplicated = String.raw`Problem What is $2^{1999}\cdot5^{2001}$? (A) 2 (B) 4 (C) 5 (D) 7 (E) 10 $\mathrm{\textbf{(A)}\ 2}\qquad\mathrm{\textbf{(B)}\ 4}$`;
  assert.deepEqual(extractChoiceMap(duplicated), { A: "2", B: "4", C: "5", D: "7", E: "10" });
  assert.equal(extractAopsQuestionText(duplicated), String.raw`What is $2^{1999}\cdot5^{2001}$?`);
  const markdownChoices = "Choose. (A) **bold** (B) $x^2$ (C) `code`";
  assert.deepEqual(extractChoiceMap(markdownChoices), { A: "**bold**", B: "$x^2$", C: "`code`" });
  const percentageChoices = String.raw`Problem What percent did Alice pay? $\mathrm{(A)\ }25\%\qquad\mathrm{(B)\ }30\%\qquad\mathrm{(C)\ }35\%\qquad\mathrm{(D)\ }60\%\qquad\mathrm{(E)\ }65\%$`;
  assert.deepEqual(extractChoiceMap(percentageChoices), {
    A: "$25\\%$", B: "$30\\%$", C: "$35\\%$", D: "$60\\%$", E: "$65\\%$",
  });
  assert.equal(extractAopsQuestionText(percentageChoices), "What percent did Alice pay?");
  const proseChoices = String.raw`Problem Which is true? $\mathrm{(A)}\ All\ equilateral\ triangles\ are\ congruent\ to\ each\ other.\qquad\mathrm{(B)}\ None\ of\ these.$`;
  assert.deepEqual(extractChoiceMap(proseChoices), {
    A: "All equilateral triangles are congruent to each other.",
    B: "None of these.",
  });
  const complexChoice = String.raw`Problem Choose. $\mathrm{(A)}\ \text{infinitely\ many}\qquad\mathrm{(B)}\ \frac{1}{2}$`;
  assert.deepEqual(extractChoiceMap(complexChoice), {
    A: "infinitely many",
    B: String.raw`$\frac{1}{2}$`,
  });
  const textAndMathChoice = String.raw`Problem Choose. $\mathrm{(A)}\text{I is true.}\qquad\mathrm{(B)}x+\text{ units}$`;
  assert.deepEqual(extractChoiceMap(textAndMathChoice), {
    A: "I is true.",
    B: String.raw`$x+\text{ units}$`,
  });
  const sharedMathBlock = String.raw`Problem Pick one. $\mathrm{(A)}\frac 1{80}\qquad\mathrm{(B)}x^2\qquad\mathrm{(C)}\frac 9{80}$ Solutions`;
  assert.deepEqual(extractChoiceMap(sharedMathBlock), {
    A: String.raw`$\frac 1{80}$`,
    B: "$x^2$",
    C: String.raw`$\frac 9{80}$`,
  });
  const solutionAfterOptions = String.raw`Problem $\mathrm{(A)}7\qquad\mathrm{(B)}8\qquad\mathrm{(C)}10\qquad\mathrm{(D)}13\qquad\mathrm{(E)}18$ = Solution 1 Work follows.`;
  assert.deepEqual(extractChoiceMap(solutionAfterOptions), {
    A: "7", B: "8", C: "10", D: "13", E: "18",
  });
  assert.deepEqual(extractChoiceMap("Pick one. (A) No solution (B) One solution"), {
    A: "No solution", B: "One solution",
  });
  const currencyBeforeMathOptions = String.raw`Problem The lockers cost $137.94 to label. $\mathrm{(A)}2001\qquad\mathrm{(B)}2010$`;
  assert.equal(extractAopsQuestionText(currencyBeforeMathOptions), String.raw`The lockers cost \$137.94 to label.`);
  const textrmOptions = String.raw`Problem Find the value. $\textrm{(A)}\ 9\qquad\textrm{(B)}\ 10$`;
  assert.equal(extractAopsQuestionText(textrmOptions), "Find the value.");
  assert.deepEqual(extractChoiceMap(textrmOptions), { A: "9", B: "10" });
  const imageOptions = String.raw`Problem Choose. $\mathrm{(A)}[[getgo-aops-image:https%3A%2F%2Fexample.com%2Fa.png]]\qquad\mathrm{(B)}[[getgo-aops-image:https%3A%2F%2Fexample.com%2Fb.png]]$`;
  assert.deepEqual(extractChoiceMap(imageOptions), {
    A: "[[getgo-aops-image:https%3A%2F%2Fexample.com%2Fa.png]]",
    B: "[[getgo-aops-image:https%3A%2F%2Fexample.com%2Fb.png]]",
  });
  const tableTextChoices = String.raw`Problem Choose. $\mathrm{(A)}\hspace{3pt} \text{Triangle only} \\ \mathrm{(B)}\hspace{3pt} \text{Square and triangle only} \\ \mathrm{(C)}\hspace{3pt} \frac{1}{2}$`;
  assert.deepEqual(extractChoiceMap(tableTextChoices), {
    A: "Triangle only",
    B: "Square and triangle only",
    C: String.raw`$\frac{1}{2}$`,
  });
  const displayOptions = String.raw`Problem What is this? \[\frac{1}{2}\] \[\mathrm{(A)}\hspace{3pt}\frac{4}{9}\hspace{19pt} \\ \mathrm{(B)}\hspace{3pt}1\hspace{19pt} \\ \mathrm{(C)}\hspace{3pt}\frac{9}{4}\]`;
  assert.equal(extractAopsQuestionText(displayOptions), String.raw`What is this? \[\frac{1}{2}\]`);
  assert.deepEqual(extractChoiceMap(displayOptions), {
    A: String.raw`$\frac{4}{9}$`,
    B: "1",
    C: String.raw`$\frac{9}{4}$`,
  });
  const dottedBoldOptions = String.raw`Problem Find the area. \[\textbf{A. }10 \quad \textbf{B. }\frac{21}{2} \quad \textbf{C. }11\]`;
  assert.equal(extractAopsQuestionText(dottedBoldOptions), "Find the area.");
  assert.deepEqual(extractChoiceMap(dottedBoldOptions), {
    A: "10",
    B: String.raw`$\frac{21}{2}$`,
    C: "11",
  });
});

test("extracts the correct choice from any solution", () => {
  assert.equal(extractCorrectChoice([{ text: "Therefore the answer is (C)." }]), "C");
  assert.equal(extractCorrectChoice([{ text: "We obtain \\boxed{D}." }]), "D");
  assert.equal(extractCorrectChoice([{ text: "Thus \\boxed{\\textbf{(B)}}." }]), "B");
  assert.equal(extractCorrectChoice([{ text: "Thus \\boxed{\\text{D}}." }]), "D");
  assert.equal(extractCorrectChoice([{ text: "No final choice yet." }]), "");
  assert.equal(extractCorrectChoice([{ text: "50 \\Rightarrow \\mathrm{\\textbf{(E)}}" }]), "E");
  assert.equal(extractCorrectChoice([{ text: "Therefore \\mathrm{(C)}." }]), "C");
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
    async start(_input: unknown, control: { setProgress(completed: number, total: number, label: string): Promise<void>; report(label: string): Promise<void> }) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await control.setProgress(0, 30, "Parsing 0/30 questions");
      await control.setProgress(6, 30, "Parsing 6/30 questions");
      await new Promise((resolve) => setTimeout(resolve, 20));
      await control.setProgress(30, 30, "Parsing 30/30 questions");
      await control.report("Imported paper");
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
    assert.ok(jobs.every((job) => job.status === "completed" && job.completed === 30 && job.total === 30));
    assert.ok(jobs.every((job) => job.logs?.some((entry) => entry.message.includes("6/30"))));
    assert.ok(JSON.parse(await fs.readFile(path.join(directory, "amc-import-jobs.json"), "utf8")).jobs.length === 3);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
