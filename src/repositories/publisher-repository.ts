import fs from "node:fs/promises";
import path from "node:path";

export interface MarketplacePublisherRecord {
  id: string;
  name: { en: string; vi: string };
  description: { en: string; vi: string };
  logo?: string;
  banner?: string;
  website?: string;
  supportUrl?: string;
  verified: boolean;
  status: "active" | "suspended";
}

const publishersRoot = (repositoryPath: string) => path.join(repositoryPath, "content-v2", "publishers");
const validId = (value: string) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) throw new Error("Publisher ID must use lowercase letters, numbers, and hyphens.");
  return value;
};

export async function listMarketplacePublishers(repositoryPath: string): Promise<MarketplacePublisherRecord[]> {
  const root = publishersRoot(repositoryPath);
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  const records = await Promise.all(entries.filter(item => item.isFile() && item.name.endsWith(".json")).map(async item =>
    JSON.parse(await fs.readFile(path.join(root, item.name), "utf8")) as MarketplacePublisherRecord));
  return records.sort((a, b) => a.name.en.localeCompare(b.name.en));
}

export async function saveMarketplacePublisher(repositoryPath: string, value: MarketplacePublisherRecord): Promise<MarketplacePublisherRecord> {
  const record: MarketplacePublisherRecord = {
    ...value,
    id: validId(value.id.trim()),
    name: { en: value.name.en.trim(), vi: value.name.vi.trim() },
    description: { en: value.description.en.trim(), vi: value.description.vi.trim() },
    verified: Boolean(value.verified),
    status: value.status === "suspended" ? "suspended" : "active",
  };
  if (!record.name.en || !record.name.vi) throw new Error("Publisher names are required.");
  await fs.mkdir(publishersRoot(repositoryPath), { recursive: true });
  await fs.writeFile(path.join(publishersRoot(repositoryPath), `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

export async function deleteMarketplacePublisher(repositoryPath: string, publisherId: string): Promise<void> {
  await fs.rm(path.join(publishersRoot(repositoryPath), `${validId(publisherId)}.json`));
}

export async function generateMarketplaceMetadata(repositoryPath: string): Promise<{ topics: number; quizzes: number }> {
  const publishers = await listMarketplacePublishers(repositoryPath);
  const publisher = publishers.find(item => item.id === "getgo") ?? publishers[0];
  if (!publisher) throw new Error("Create at least one publisher before generating marketplace metadata.");
  const topicsRoot = path.join(repositoryPath, "content-v2", "topics");
  const topicEntries = await fs.readdir(topicsRoot, { withFileTypes: true });
  let topicCount = 0;
  let quizCount = 0;
  for (const entry of topicEntries.filter(item => item.isDirectory() && !item.name.startsWith("."))) {
    const topicFile = path.join(topicsRoot, entry.name, "topic.json");
    const topic = JSON.parse(await fs.readFile(topicFile, "utf8")) as Record<string, unknown>;
    const description = String(topic.description ?? "").trim();
    const kidLearning = topic.type === "kid-learning";
    topic.publisherId = publisher.id;
    topic.publisher = { id: publisher.id, displayName: publisher.name.en, verified: publisher.verified };
    topic.marketplace = {
      shortDescription: description,
      fullDescription: kidLearning
        ? `${description} Children can explore letters, sounds, vocabulary, and guided practice at their own pace.`
        : `${description} Explore official-style practice materials, structured quiz collections, and progress-focused learning activities.`,
      subjects: topic.subject ? [topic.subject] : [],
      languages: topic.supportedLanguages ?? [],
      tags: kidLearning ? ["early learning", "alphabet", "vocabulary"] : ["mathematics", "competition", "practice"],
      learningObjectives: kidLearning
        ? ["Recognize letters and sounds", "Build practical vocabulary", "Practice through playful activities"]
        : ["Develop mathematical reasoning", "Practice competition question formats", "Track improvement over time"],
      ageRange: topic.recommendedAgeRange,
      pricing: { type: "free" },
      featured: Number(topic.order ?? 999) === 0,
    };
    await fs.writeFile(topicFile, `${JSON.stringify(topic, null, 2)}\n`);
    topicCount += 1;
    const quizzesRoot = path.join(topicsRoot, entry.name, "quizzes");
    const quizzes = await fs.readdir(quizzesRoot, { withFileTypes: true }).catch(() => []);
    for (const quizEntry of quizzes.filter(item => item.isDirectory() && !item.name.startsWith("."))) {
      const quizFile = path.join(quizzesRoot, quizEntry.name, "quiz.json");
      const quiz = JSON.parse(await fs.readFile(quizFile, "utf8")) as Record<string, unknown>;
      const type = String(quiz.type ?? "contest");
      const language = String(quiz.language ?? "en");
      const generatedDescription = type === "alphabet"
        ? language === "vi"
          ? "Học chữ cái, âm đọc và từ vựng qua hình ảnh cùng các hoạt động luyện tập vui nhộn."
          : "Learn letters, sounds, and vocabulary through images and playful practice activities."
        : "Build confidence with structured questions, guided practice, and measurable progress.";
      if (!String(quiz.description ?? "").trim()) quiz.description = generatedDescription;
      const questionEntries = await fs.readdir(path.join(quizzesRoot, quizEntry.name, "questions"), { withFileTypes: true }).catch(() => []);
      quiz.publisherId = publisher.id;
      quiz.marketplace = {
        shortDescription: quiz.description,
        languages: quiz.language ? [quiz.language] : [],
        skills: type === "alphabet" ? ["letter recognition", "phonics", "vocabulary"] : ["problem solving", "reasoning", "practice"],
        estimatedMinutes: type === "alphabet" ? 10 : 30,
        questionCount: questionEntries.filter(item => item.isFile() && item.name.endsWith(".json")).length,
        difficulty: type === "alphabet" ? "beginner" : "intermediate",
      };
      await fs.writeFile(quizFile, `${JSON.stringify(quiz, null, 2)}\n`);
      quizCount += 1;
    }
  }
  return { topics: topicCount, quizzes: quizCount };
}
