import { promises as fs } from "node:fs";
import path from "node:path";
import { amcContestGrade, extractAopsQuestionText, type AmcImportPreview, type AmcImportResult } from "../domain/amc-import.js";
import { contentTopicsRoot } from "../../topics/repository/content-source.js";
import { loadContentV2Topic, saveContentV2Question, saveContentV2Quiz, saveContentV2Topic } from "../../topics/repository/content-v2-repository.js";

const aopsImageTokenPattern = /\[\[getgo-aops-image:[^\]]+\]\]/g;

async function saveAopsImage(root: string, topicId: string, quizId: string, filename: string, sourceUrl: string): Promise<string> {
  const url = new URL(sourceUrl);
  const supportedSource = url.hostname === "latex.artofproblemsolving.com"
    || ((url.hostname === "artofproblemsolving.com" || url.hostname === "www.artofproblemsolving.com")
      && url.pathname.startsWith("/wiki/images/"));
  if (url.protocol !== "https:" || !supportedSource)
    throw new Error(`Unsupported AoPS image source: ${sourceUrl}`);
  const response = await fetch(url, { headers: { accept: "image/png,image/jpeg,image/webp" } });
  if (!response.ok) throw new Error(`AoPS image returned HTTP ${response.status}: ${sourceUrl}`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const extension = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : contentType === "image/webp" ? "webp" : null;
  if (!extension) throw new Error(`AoPS image has unsupported content type: ${contentType ?? "unknown"}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 10 * 1024 * 1024) throw new Error(`AoPS image exceeds 10 MB: ${sourceUrl}`);
  const relative = path.posix.join("questions", `${filename}.${extension}`);
  const target = path.join(contentTopicsRoot(root), topicId, "quizzes", quizId, "assets", ...relative.split("/"));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return `asset:${relative}`;
}

export async function amcQuizExists(root: string, topicId: string, quizId: string): Promise<boolean> {
  return fs.access(path.join(contentTopicsRoot(root), topicId, "quizzes", quizId, "quiz.json")).then(() => true).catch(() => false);
}

export async function importAmcPreview(root: string, preview: AmcImportPreview, overwrite: boolean): Promise<AmcImportResult> {
  if (await amcQuizExists(root, preview.topic.id, preview.quiz.id) && !overwrite)
    throw new Error(`Quiz ${preview.quiz.title} already exists.`);
  const importedAt = new Date().toISOString();
  const grade = amcContestGrade(preview.quiz.contest);
  const topicSource = { provider: "AoPS", url: preview.sourceIndexUrl, indexUrl: preview.sourceIndexUrl, externalId: preview.topic.title, importedAt };
  const existingTopic = await loadContentV2Topic(root, preview.topic.id).catch(() => null);
  const topic = existingTopic
    ? await saveContentV2Topic(root, {
        ...existingTopic,
        grades: [grade],
        marketplace: { ...existingTopic.marketplace, experimental: true },
        src: preview.sourceIndexUrl,
        source: topicSource,
      })
    : await saveContentV2Topic(root, {
        schemaVersion: 2, id: preview.topic.id, type: "competition", title: preview.topic.title,
        description: `American Mathematics Competitions ${preview.topic.title} papers imported from AoPS.`,
        subject: "Mathematics", subjects: ["Mathematics"], grades: [grade], marketplace: { experimental: true },
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
    const questionAssets = await Promise.all((imported.imageUrls ?? []).map((url, imageIndex) =>
      saveAopsImage(root, topic.id, quiz.id, `question-${imported.id}${imageIndex ? `-${imageIndex + 1}` : ""}`, url)));
    const choiceImageEntries = await Promise.all(Object.entries(imported.choiceImageUrls ?? {}).map(async ([label, url]) => [
      label,
      await saveAopsImage(root, topic.id, quiz.id, `question-${imported.id}-choice-${label.toLowerCase()}`, url),
    ] as const));
    const choiceImageAssets = Object.fromEntries(choiceImageEntries);
    const choices = Object.fromEntries(Object.entries(imported.choices).map(([label, value]) => [label, choiceImageAssets[label] ?? value]));
    const answer = Object.keys(choices).length >= 2
      ? { type: choiceImageEntries.length === Object.keys(choices).length ? "image_choice" : "text_choice", correct: imported.correct, choices }
      : { type: "input", correct: imported.correct };
    await saveContentV2Question(root, topic, quiz, {
      schemaVersion: 2, id: imported.id, src: imported.sourceUrl, type: "competition-question", order: index, status: "pending",
      category: preview.quiz.contest, text: { en: extractAopsQuestionText(imported.text).replace(aopsImageTokenPattern, "").replace(/\n{3,}/g, "\n\n").trim() }, assets: questionAssets, answer,
      explanation: { en: `${solutions}${solutions ? "\n\n" : ""}[Source](${imported.sourceUrl})` },
      source: { provider: "AoPS", url: imported.sourceUrl, indexUrl: preview.sourceIndexUrl, externalId: `${preview.quiz.id}/problem-${imported.number}`, importedAt },
      solutions: normalizedSolutions.map((solution) => ({ title: solution.title, text: solution.text, sourceUrl: imported.sourceUrl })),
    });
  }
  return { topicId: topic.id, quizId: quiz.id, questionCount: preview.questions.length, route: `/topics/${topic.id}/quizzes/${quiz.id}` };
}
