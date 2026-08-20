import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ContentV2Quiz,
  ContentV2Topic,
} from "../domain/content-v2.js";
import {
  loadContentV2Question,
  saveContentV2Quiz,
} from "./content-v2-repository.js";

function questionDirectory(
  repositoryPath: string,
  topicId: string,
  quizId: string,
): string {
  return path.join(
    path.resolve(repositoryPath),
    "content-v2",
    "topics",
    topicId,
    "quizzes",
    quizId,
    "questions",
  );
}

async function writeQuestion(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await fs.rename(temporary, filePath);
  } catch (cause) {
    await fs.rm(temporary, { force: true });
    throw cause;
  }
}

export async function reviewAllContentV2Questions(
  repositoryPath: string,
  topic: ContentV2Topic,
  quiz: ContentV2Quiz,
): Promise<{ reviewed: number; changed: number }> {
  const directory = questionDirectory(repositoryPath, topic.id, quiz.id);
  const files = (await fs.readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const questions = await Promise.all(
    files.map((entry) =>
      loadContentV2Question(
        repositoryPath,
        topic.id,
        quiz.id,
        entry.name.slice(0, -5),
      ),
    ),
  );
  const changed = questions.filter((question) => question.status !== "reviewed");
  await Promise.all(
    changed.map((question) =>
      writeQuestion(path.join(directory, `${question.id}.json`), {
        ...question,
        status: "reviewed",
      }),
    ),
  );
  if (changed.length) await saveContentV2Quiz(repositoryPath, topic, quiz);
  return { reviewed: questions.length, changed: changed.length };
}
