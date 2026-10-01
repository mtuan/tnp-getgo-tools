import { promises as fs } from "node:fs";
import path from "node:path";
import { extractAopsQuestionText, type AmcImportPreview, type AmcImportResult } from "../domain/amc-import.js";
import { contentTopicsRoot } from "../../topics/repository/content-source.js";
import { loadContentV2Topic, saveContentV2Question, saveContentV2Quiz, saveContentV2Topic } from "../../topics/repository/content-v2-repository.js";

export async function amcQuizExists(root: string, topicId: string, quizId: string): Promise<boolean> {
  return fs.access(path.join(contentTopicsRoot(root), topicId, "quizzes", quizId, "quiz.json")).then(() => true).catch(() => false);
}

export async function importAmcPreview(root: string, preview: AmcImportPreview, overwrite: boolean): Promise<AmcImportResult> {
  if (await amcQuizExists(root, preview.topic.id, preview.quiz.id) && !overwrite)
    throw new Error(`Quiz ${preview.quiz.title} already exists.`);
  const importedAt = new Date().toISOString();
  const grade = Number(preview.quiz.contest.match(/AMC\s*(8|10|12)/i)?.[1] ?? 12);
  const topicSource = { provider: "AoPS", url: preview.sourceIndexUrl, indexUrl: preview.sourceIndexUrl, externalId: preview.topic.title, importedAt };
  const existingTopic = await loadContentV2Topic(root, preview.topic.id).catch(() => null);
  const topic = existingTopic
    ? await saveContentV2Topic(root, { ...existingTopic, src: preview.sourceIndexUrl, source: topicSource })
    : await saveContentV2Topic(root, {
        schemaVersion: 2, id: preview.topic.id, type: "competition", title: preview.topic.title,
        description: `American Mathematics Competitions ${preview.topic.title} papers imported from AoPS.`,
        subject: "Mathematics", subjects: ["Mathematics"], grades: Array.from({ length: grade }, (_, index) => index + 1),
        rounds: [{ id: preview.topic.id, title: preview.topic.title }], gradeGroups: [], status: "draft", order: 0, src: preview.sourceIndexUrl, source: topicSource,
      });
  const quiz = await saveContentV2Quiz(root, topic, {
    schemaVersion: 2, id: preview.quiz.id, topicId: topic.id, type: "competition-paper",
    title: preview.quiz.title, description: `Problems and solutions from ${preview.sourcePaperUrl}`,
    supportedLanguages: ["en"], grade: String(grade), round: topic.id, year: String(preview.quiz.year),
    status: "draft", order: 0, sharedCode: "", src: preview.sourcePaperUrl,
    source: { provider: "AoPS", url: preview.sourcePaperUrl, indexUrl: preview.sourceIndexUrl, externalId: `${preview.quiz.year} ${preview.quiz.contest}`, importedAt },
  });
  for (const [index, imported] of preview.questions.entries()) {
    const normalizedSolutions = imported.solutions.map((solution) => ({
      ...solution,
      title: imported.solutions.length === 1 ? "Solution" : solution.title,
    }));
    const solutions = normalizedSolutions.length === 1
      ? normalizedSolutions[0].text
      : normalizedSolutions.map((solution) => `## ${solution.title}\n\n${solution.text}`).join("\n\n");
    const answer = Object.keys(imported.choices).length >= 2
      ? { type: "text_choice", correct: imported.correct, choices: imported.choices }
      : { type: "input", correct: imported.correct };
    await saveContentV2Question(root, topic, quiz, {
      schemaVersion: 2, id: imported.id, src: imported.sourceUrl, type: "competition-question", order: index, status: "pending",
      category: preview.quiz.contest, text: { en: extractAopsQuestionText(imported.text) }, assets: [], answer,
      explanation: { en: `${solutions}${solutions ? "\n\n" : ""}[Source](${imported.sourceUrl})` },
      source: { provider: "AoPS", url: imported.sourceUrl, indexUrl: preview.sourceIndexUrl, externalId: `${preview.quiz.id}/problem-${imported.number}`, importedAt },
      solutions: normalizedSolutions.map((solution) => ({ title: solution.title, text: solution.text, sourceUrl: imported.sourceUrl })),
    });
  }
  return { topicId: topic.id, quizId: quiz.id, questionCount: preview.questions.length, route: `/topics/${topic.id}/quizzes/${quiz.id}` };
}
