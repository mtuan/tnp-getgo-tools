import { promises as fs } from "node:fs";
import path from "node:path";
import type { IpcMain } from "electron";
import { amcContestNames, type AmcImportPreview } from "../domain/amc-import.js";
import { discoverAmcArchive, previewAmcPaper } from "./amc-browser.js";
import { contentTopicsRoot } from "../../topics/repository/content-source.js";
import { loadContentV2Topic, saveContentV2Question, saveContentV2Quiz, saveContentV2Topic } from "../../topics/repository/content-v2-repository.js";

interface Dependencies { repositoryRoot(): Promise<string> }

function validatePreview(value: unknown): AmcImportPreview {
  const preview = value as AmcImportPreview;
  if (!preview || typeof preview !== "object" || !amcContestNames.includes(preview.quiz?.contest) || !Number.isInteger(preview.quiz?.year))
    throw new Error("Invalid AMC import preview.");
  if (!/^[a-z][a-z0-9_-]*$/.test(preview.topic?.id) || !/^[a-z0-9][a-z0-9_-]*$/.test(preview.quiz?.id) || !Array.isArray(preview.questions))
    throw new Error("Invalid AMC import content.");
  if (!preview.questions.every((question) => /^q[1-9][0-9]*$/.test(question.id) && question.number > 0 && typeof question.text === "string" && Array.isArray(question.solutions)))
    throw new Error("Invalid AMC questions.");
  return preview;
}

export function registerAmcImportIpc(ipcMain: IpcMain, { repositoryRoot }: Dependencies): void {
  ipcMain.handle("amc-import:archive:discover", () => discoverAmcArchive());
  ipcMain.handle("amc-import:paper:preview", (_event, contest: unknown, year: unknown) => {
    if (typeof contest !== "string" || !amcContestNames.includes(contest as never)) throw new Error("Invalid AMC contest.");
    if (!Number.isInteger(year) || Number(year) < 1950 || Number(year) > 2100) throw new Error("Enter a valid AMC year.");
    return previewAmcPaper(contest as (typeof amcContestNames)[number], Number(year));
  });
  ipcMain.handle("amc-import:paper:import", async (_event, value: unknown, overwriteValue: unknown) => {
    const preview = validatePreview(value);
    const overwrite = overwriteValue === true;
    const root = await repositoryRoot();
    const quizDirectory = path.join(contentTopicsRoot(root), preview.topic.id, "quizzes", preview.quiz.id);
    const exists = await fs.access(path.join(quizDirectory, "quiz.json")).then(() => true).catch(() => false);
    if (exists && !overwrite) throw new Error(`Quiz ${preview.quiz.title} already exists. Enable overwrite to replace its imported records.`);
    const grade = Number(preview.quiz.contest.match(/\d+/)?.[0] ?? 8);
    const topic = await loadContentV2Topic(root, preview.topic.id).catch(() => saveContentV2Topic(root, {
      schemaVersion: 2, id: preview.topic.id, type: "competition", title: preview.topic.title,
      description: `American Mathematics Competitions ${preview.topic.title} papers imported from AoPS.`,
      subject: "Mathematics", subjects: ["Mathematics"], grades: Array.from({ length: grade }, (_, index) => index + 1),
      rounds: [{ id: preview.topic.id, title: preview.topic.title }], gradeGroups: [], status: "draft", order: 0,
    }));
    const quiz = await saveContentV2Quiz(root, topic, {
      schemaVersion: 2, id: preview.quiz.id, topicId: topic.id, type: "competition-paper",
      title: preview.quiz.title, description: `Problems and solutions from ${preview.sourcePaperUrl}`,
      supportedLanguages: ["en"], grade: String(grade), round: topic.id, year: String(preview.quiz.year),
      status: "draft", order: 0, sharedCode: "",
    });
    for (const [index, imported] of preview.questions.entries()) {
      const solutions = imported.solutions.map((solution) => `## ${solution.title}\n\n${solution.text}`).join("\n\n");
      const choices = imported.choices;
      const answer = Object.keys(choices).length >= 2
        ? { type: "text_choice", correct: imported.correct, choices }
        : { type: "input", correct: imported.correct };
      await saveContentV2Question(root, topic, quiz, {
        schemaVersion: 2, id: imported.id, type: "competition-question", order: index, status: "pending",
        category: preview.quiz.contest, text: { en: imported.text }, assets: [], answer,
        explanation: { en: `${solutions}${solutions ? "\n\n" : ""}Source: ${imported.sourceUrl}` },
      });
    }
    return { topicId: topic.id, quizId: quiz.id, questionCount: preview.questions.length, route: `/topics/${topic.id}/quizzes/${quiz.id}` };
  });
}
