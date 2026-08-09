import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  assertContentV2Relationship,
  contentV2QuestionSchema,
  contentV2QuizSchema,
  contentV2TopicSchema,
  hashContentV2,
  sanitizeContentV2Question,
  sanitizeContentV2Quiz,
  sanitizeContentV2Topic,
  type ContentV2Question,
  type ContentV2Quiz,
  type ContentV2Topic,
} from "../core/content-v2.js";
import type {
  ContentV2QuestionSummary,
  ContentV2QuizSummary,
  ContentV2Snapshot,
  ContentV2TopicSummary,
  ScanIssue,
} from "../core/models.js";
import type { ContentV2QuizPublishState } from "../core/content-v2-publish-state.js";
import {
  parseAlphabetDictionary,
  parseKidLearningDictionary,
} from "./alphabet-dictionary.js";

const topicIdPattern = /^[a-z][a-z0-9-]*$/;

function sharedDictionaryPath(
  repositoryPath: string,
  topicId: string,
) {
  return path.join(
    contentRoot(repositoryPath),
    validateId(topicId, "Topic ID"),
    "resources",
    "dictionary.json",
  );
}

function validateId(value: string, label: string): string {
  if (!topicIdPattern.test(value))
    throw new Error(
      `${label} must use lowercase letters, numbers, and hyphens.`,
    );
  return value;
}

function contentRoot(repositoryPath: string): string {
  return path.join(path.resolve(repositoryPath), "content-v2", "topics");
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filePath);
}

async function saveMetadataIcon(
  assetsDirectory: string,
  ownerId: string,
  dataUrl: string,
): Promise<string> {
  const match = /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("The selected icon is not a supported image.");
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
  };
  const extension = extensions[match[1]];
  const basename = `${validateId(ownerId, "Icon owner ID")}-icon`;
  await fs.mkdir(assetsDirectory, { recursive: true });
  await Promise.all(
    Object.values(extensions).map((candidate) =>
      fs.rm(path.join(assetsDirectory, `${basename}.${candidate}`), { force: true }),
    ),
  );
  const filename = `${basename}.${extension}`;
  await fs.writeFile(path.join(assetsDirectory, filename), Buffer.from(match[2], "base64"));
  return `asset:${filename}`;
}

async function directories(directory: string): Promise<string[]> {
  return (await fs.readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function questionFiles(directory: string): Promise<string[]> {
  return (await fs.readdir(directory, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

export interface LoadedContentV2 {
  snapshot: ContentV2Snapshot;
}

export interface ContentV2Asset {
  reference: string;
  sourcePath: string;
  contentHash: string;
  mimeType: string;
  data: Uint8Array;
}

export async function scanContentV2Repository(
  repositoryPath: string,
): Promise<LoadedContentV2> {
  const scanStartedAt = Date.now();
  const root = contentRoot(repositoryPath);
  console.info("[GetGo Tools][Content V2 index] Started", { root });
  const topics: ContentV2TopicSummary[] = [];
  const quizzes: ContentV2QuizSummary[] = [];
  const questions: ContentV2QuestionSummary[] = [];
  const issues: ScanIssue[] = [];
  const questionKeys = new Set<string>();

  for (const topicDirectoryName of await directories(root)) {
    const topicStartedAt = Date.now();
    const topicFile = path.join(root, topicDirectoryName, "topic.json");
    let topic: ContentV2Topic;
    try {
      topic = contentV2TopicSchema.parse(await readJson(topicFile));
      if (topic.id !== topicDirectoryName)
        throw new Error(
          `Topic ID “${topic.id}” does not match directory “${topicDirectoryName}”.`,
        );
    } catch (cause) {
      issues.push({
        path: path.relative(repositoryPath, topicFile),
        message: cause instanceof Error ? cause.message : String(cause),
      });
      continue;
    }

    const topicQuizzes: ContentV2QuizSummary[] = [];
    const quizzesRoot = path.join(root, topic.id, "quizzes");
    for (const quizDirectoryName of await directories(quizzesRoot)) {
      const quizStartedAt = Date.now();
      const quizFile = path.join(quizzesRoot, quizDirectoryName, "quiz.json");
      let quiz: ContentV2Quiz;
      try {
        quiz = contentV2QuizSchema.parse(await readJson(quizFile));
        if (quiz.id !== quizDirectoryName)
          throw new Error(
            `Quiz ID “${quiz.id}” does not match directory “${quizDirectoryName}”.`,
          );
        if (quiz.topicId !== topic.id)
          throw new Error(
            `Quiz topicId “${quiz.topicId}” does not match topic “${topic.id}”.`,
          );
        assertContentV2Relationship(topic.type, quiz.type, "quiz");
      } catch (cause) {
        issues.push({
          path: path.relative(repositoryPath, quizFile),
          message: cause instanceof Error ? cause.message : String(cause),
        });
        continue;
      }

      const quizQuestions: Array<{
        record: ContentV2Question;
        summary: ContentV2QuestionSummary;
      }> = [];
      const questionsStartedAt = Date.now();
      for (const questionFile of await questionFiles(
        path.join(path.dirname(quizFile), "questions"),
      )) {
        try {
          const question = contentV2QuestionSchema.parse(
            await readJson(questionFile),
          );
          assertContentV2Relationship(quiz.type, question.type, "question");
          const key = `${topic.id}/${quiz.id}/${question.id}`;
          if (questionKeys.has(key))
            throw new Error(
              `Question ID “${question.id}” occurs more than once.`,
            );
          questionKeys.add(key);
          quizQuestions.push({
            record: question,
            summary: {
              key,
              topicId: topic.id,
              quizId: quiz.id,
              id: question.id,
              type: question.type,
              order: question.order,
              status: question.status,
              filePath: questionFile,
              localHash: hashContentV2(sanitizeContentV2Question(question)),
              label:
                question.type === "alphabet-letter"
                  ? `${question.uppercase} ${question.lowercase}`
                  : Array.isArray(question.text.en)
                    ? question.text.en.join(" ")
                    : question.text.en,
              ...(question.type === "competition-question"
                ? {
                    category: question.category,
                    hasImages: question.assets.length > 0,
                    dynamic: Boolean(question.dynamic),
                  }
                : {}),
            },
          });
        } catch (cause) {
          issues.push({
            path: path.relative(repositoryPath, questionFile),
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      quizQuestions.sort(
        (left, right) =>
          left.record.order - right.record.order ||
          left.record.id.localeCompare(right.record.id),
      );
      questions.push(...quizQuestions.map((item) => item.summary));
      const questionsDurationMs = Date.now() - questionsStartedAt;
      let resources: Record<string, unknown> = {};
      const resourcesStartedAt = Date.now();
      if (quiz.type === "alphabet" || quiz.type === "spelling") {
        const dictionaryPath = sharedDictionaryPath(
          repositoryPath,
          topic.id,
        );
        try {
          resources = {
            dictionary: parseKidLearningDictionary(await readJson(dictionaryPath)),
          };
        } catch (cause) {
          issues.push({
            path: path.relative(repositoryPath, dictionaryPath),
            message: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      const resourcesDurationMs = Date.now() - resourcesStartedAt;
      let assetHashes: Array<{ reference: string; contentHash: string }> = [];
      const assetsStartedAt = Date.now();
      try {
        assetHashes = (
          await loadContentV2Assets(repositoryPath, topic.id, quiz.id, {
            topic,
            quiz,
            questions: quizQuestions.map((item) => item.record),
            resources,
          })
        ).map((asset) => ({
          reference: asset.reference,
          contentHash: asset.contentHash,
        }));
      } catch (cause) {
        issues.push({
          path: path.relative(repositoryPath, quizFile),
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
      const assetsDurationMs = Date.now() - assetsStartedAt;
      const localHash = hashContentV2({
        quiz: sanitizeContentV2Quiz(quiz),
        questions: quizQuestions.map((item) =>
          sanitizeContentV2Question(item.record),
        ),
        resources,
        assets: assetHashes,
      });
      const summary: ContentV2QuizSummary = {
        key: `${topic.id}/${quiz.id}`,
        topicId: topic.id,
        id: quiz.id,
        type: quiz.type,
        title: quiz.title,
        icon: quiz.icon,
        description: quiz.description,
        status: quiz.status,
        order: quiz.order,
        filePath: quizFile,
        localHash,
        publishedHash: quiz.publishedHash ?? null,
        publishedAt: quiz.publishedAt ?? null,
        questionCount: quizQuestions.length,
        reviewedQuestionCount: quizQuestions.filter(
          (item) => item.record.status === "reviewed",
        ).length,
        ...(quiz.type === "competition-paper"
          ? { grade: quiz.grade, round: quiz.round, year: quiz.year }
          : { language: quiz.language }),
      };
      quizzes.push(summary);
      topicQuizzes.push(summary);
      const quizDurationMs = Date.now() - quizStartedAt;
      // Keep startup diagnostics useful without printing hundreds of routine
      // quiz entries (and making the measured startup itself slower).
      if (quizDurationMs >= 100) {
        console.info("[GetGo Tools][Content V2 index] Slow quiz indexed", {
          topicId: topic.id,
          quizId: quiz.id,
          questions: quizQuestions.length,
          assets: assetHashes.length,
          questionsDurationMs,
          resourcesDurationMs,
          assetsDurationMs,
          durationMs: quizDurationMs,
        });
      }
    }
    topicQuizzes.sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
    topics.push({
      id: topic.id,
      type: topic.type,
      title: topic.title,
      icon: topic.icon,
      description: topic.description,
      status: topic.status,
      order: topic.order,
      filePath: topicFile,
      localHash: hashContentV2({
        topic: sanitizeContentV2Topic(topic),
        quizzes: topicQuizzes.map((quiz) => ({
          id: quiz.id,
          type: quiz.type,
          order: quiz.order,
        })),
      }),
      publishedHash: topic.publishedHash ?? null,
      publishedAt: topic.publishedAt ?? null,
      quizCount: topicQuizzes.length,
      ...(topic.type === "competition"
        ? {
            subject: topic.subject,
            rounds: topic.rounds,
            gradeGroups: topic.gradeGroups,
          }
        : {
            supportedLanguages: topic.supportedLanguages,
            recommendedAgeRange: topic.recommendedAgeRange,
          }),
    });
    console.info("[GetGo Tools][Content V2 index] Topic indexed", {
      topicId: topic.id,
      quizzes: topicQuizzes.length,
      durationMs: Date.now() - topicStartedAt,
    });
  }

  topics.sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  quizzes.sort(
    (left, right) =>
      left.topicId.localeCompare(right.topicId) ||
      left.order - right.order ||
      left.id.localeCompare(right.id),
  );
  questions.sort(
    (left, right) =>
      left.topicId.localeCompare(right.topicId) ||
      left.quizId.localeCompare(right.quizId) ||
      left.order - right.order ||
      left.id.localeCompare(right.id),
  );
  console.info("[GetGo Tools][Content V2 index] Completed", {
    topics: topics.length,
    quizzes: quizzes.length,
    questions: questions.length,
    issues: issues.length,
    durationMs: Date.now() - scanStartedAt,
  });
  return {
    snapshot: { topics, quizzes, questions, issues },
  };
}

export async function saveContentV2Topic(
  repositoryPath: string,
  value: unknown,
): Promise<ContentV2Topic> {
  const rawTopic = value as { id?: unknown; icon?: unknown };
  const normalizedTopic = typeof rawTopic?.icon === "string" && rawTopic.icon.startsWith("data:image/")
    ? { ...(value as Record<string, unknown>), icon: await saveMetadataIcon(path.join(contentRoot(repositoryPath), validateId(String(rawTopic.id), "Topic ID"), "assets"), "topic", rawTopic.icon) }
    : value;
  const topic = contentV2TopicSchema.parse(normalizedTopic);
  const filePath = path.join(
    contentRoot(repositoryPath),
    validateId(topic.id, "Topic ID"),
    "topic.json",
  );
  const existing = (await fs
    .readFile(filePath, "utf8")
    .then(JSON.parse)
    .catch(() => null)) as { type?: unknown } | null;
  if (existing?.type && existing.type !== topic.type)
    throw new Error("A topic type cannot be changed after creation.");
  await writeJson(filePath, topic);
  return topic;
}

export async function loadContentV2Topic(
  repositoryPath: string,
  topicId: string,
): Promise<ContentV2Topic> {
  return contentV2TopicSchema.parse(
    await readJson(
      path.join(
        contentRoot(repositoryPath),
        validateId(topicId, "Topic ID"),
        "topic.json",
      ),
    ),
  );
}

export async function loadContentV2Quiz(
  repositoryPath: string,
  topicId: string,
  quizId: string,
): Promise<ContentV2Quiz> {
  return contentV2QuizSchema.parse(
    await readJson(
      path.join(
        contentRoot(repositoryPath),
        validateId(topicId, "Topic ID"),
        "quizzes",
        validateId(quizId, "Quiz ID"),
        "quiz.json",
      ),
    ),
  );
}

export async function loadContentV2Question(
  repositoryPath: string,
  topicId: string,
  quizId: string,
  questionId: string,
): Promise<ContentV2Question> {
  return contentV2QuestionSchema.parse(
    await readJson(
      path.join(
        contentRoot(repositoryPath),
        validateId(topicId, "Topic ID"),
        "quizzes",
        validateId(quizId, "Quiz ID"),
        "questions",
        `${validateId(questionId, "Question ID")}.json`,
      ),
    ),
  );
}

export async function loadContentV2QuizResources(
  repositoryPath: string,
  topicId: string,
  quiz: ContentV2Quiz,
): Promise<Record<string, unknown>> {
  if (quiz.type !== "alphabet" && quiz.type !== "spelling") return {};
  const dictionaryPath = sharedDictionaryPath(repositoryPath, topicId);
  return {
    dictionary: parseKidLearningDictionary(await readJson(dictionaryPath)),
  };
}

export async function loadContentV2TopicDictionary(
  repositoryPath: string,
  topicId: string,
) {
  return parseKidLearningDictionary(
    await readJson(sharedDictionaryPath(repositoryPath, topicId)),
  );
}

export async function saveContentV2TopicDictionary(
  repositoryPath: string,
  topicId: string,
  value: unknown,
) {
  const dictionary = parseKidLearningDictionary(value);
  await writeJson(sharedDictionaryPath(repositoryPath, topicId), dictionary);
  return dictionary;
}

export async function saveContentV2QuizDictionary(
  repositoryPath: string,
  topicId: string,
  quiz: ContentV2Quiz,
  value: unknown,
) {
  if (quiz.type !== "alphabet" && quiz.type !== "spelling")
    throw new Error("Only alphabet and spelling quizzes have dictionaries.");
  const dictionary = parseAlphabetDictionary(value);
  const dictionaryPath = sharedDictionaryPath(repositoryPath, topicId);
  const shared = parseKidLearningDictionary(await readJson(dictionaryPath));
  const available = new Set(shared.entries.map((entry) => entry.id));
  const claimed = new Set<string>();
  const normalized = (text: string) => text.trim().toLocaleLowerCase(quiz.language);
  const translations = new Map(
    shared.entries.flatMap((entry) => {
      const translation = entry.translations[quiz.language];
      return translation ? [[normalized(translation.text), entry] as const] : [];
    }),
  );
  for (const entry of shared.entries) delete entry.translations[quiz.language];
  for (const word of dictionary.words) {
    const existing = translations.get(normalized(word.text))
      ?? shared.entries.find((entry) => !claimed.has(entry.id) && entry.image && entry.image === word.image);
    const base = normalized(word.text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "word";
    let id = existing?.id ?? base;
    for (let suffix = 2; available.has(id) && !existing; suffix += 1) id = `${base}-${suffix}`;
    const target = existing ?? { id, minimumAge: word.minimumAge, translations: {} };
    if (!existing) {
      available.add(id);
      shared.entries.push(target);
    }
    claimed.add(target.id);
    target.minimumAge = word.minimumAge;
    if (word.image) target.image = word.image;
    const { image: _image, minimumAge: _minimumAge, ...localizedWord } = word;
    target.translations[quiz.language] = localizedWord;
  }
  shared.entries = shared.entries.filter((entry) => Object.keys(entry.translations).length > 0);
  await writeJson(dictionaryPath, shared);
  return dictionary;
}

function collectAssetReferences(
  value: unknown,
  references = new Set<string>(),
): Set<string> {
  if (typeof value === "string" && value.startsWith("asset:"))
    references.add(value);
  else if (Array.isArray(value))
    for (const item of value) collectAssetReferences(item, references);
  else if (value && typeof value === "object")
    for (const item of Object.values(value as Record<string, unknown>))
      collectAssetReferences(item, references);
  return references;
}

export async function loadContentV2Assets(
  repositoryPath: string,
  topicId: string,
  quizId: string,
  content: unknown,
): Promise<ContentV2Asset[]> {
  const topicDirectory = path.join(
    contentRoot(repositoryPath),
    validateId(topicId, "Topic ID"),
  );
  const quizDirectory = path.join(
    topicDirectory,
    "quizzes",
    validateId(quizId, "Quiz ID"),
  );
  const mimeTypes: Record<string, string> = {
    ".avif": "image/avif",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
  const result: ContentV2Asset[] = [];
  for (const reference of [...collectAssetReferences(content)].sort()) {
    const relativeAsset = reference.slice("asset:".length);
    if (
      !relativeAsset ||
      path.isAbsolute(relativeAsset) ||
      relativeAsset.split(/[\\/]/).includes("..")
    )
      throw new Error(`Invalid asset reference: ${reference}.`);
    const candidates = [
      path.resolve(quizDirectory, "assets", relativeAsset),
      path.resolve(topicDirectory, "assets", relativeAsset),
    ];
    let sourcePath: string | null = null;
    for (const candidate of candidates) {
      if (
        await fs
          .access(candidate)
          .then(() => true)
          .catch(() => false)
      ) {
        sourcePath = candidate;
        break;
      }
    }
    if (!sourcePath)
      throw new Error(
        `Asset ${reference} was not found in the quiz or topic assets folder.`,
      );
    const mimeType = mimeTypes[path.extname(sourcePath).toLowerCase()];
    if (!mimeType)
      throw new Error(`Asset ${reference} has an unsupported file type.`);
    const data = await fs.readFile(sourcePath);
    result.push({
      reference,
      sourcePath,
      contentHash: createHash("sha256").update(data).digest("hex"),
      mimeType,
      data,
    });
  }
  return result;
}

/** Reads the current quiz files and calculates the hash without retaining
 * quiz, question, dictionary, or asset contents in memory. */
export async function calculateContentV2QuizHash(
  repositoryPath: string,
  topicId: string,
  quizId: string,
): Promise<string> {
  const topic = await loadContentV2Topic(repositoryPath, topicId);
  const quiz = await loadContentV2Quiz(repositoryPath, topicId, quizId);
  const questionDirectory = path.join(
    contentRoot(repositoryPath),
    topicId,
    "quizzes",
    quizId,
    "questions",
  );
  const questions = await Promise.all(
    (await questionFiles(questionDirectory)).map(async (filePath) =>
      contentV2QuestionSchema.parse(await readJson(filePath))),
  );
  questions.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const resources = await loadContentV2QuizResources(repositoryPath, topicId, quiz);
  const assets = (await loadContentV2Assets(repositoryPath, topicId, quizId, {
    topic,
    quiz,
    questions,
    resources,
  })).map((asset) => ({ reference: asset.reference, contentHash: asset.contentHash }));
  return hashContentV2({
    quiz: sanitizeContentV2Quiz(quiz),
    questions: questions.map(sanitizeContentV2Question),
    resources,
    assets,
  });
}

export async function saveContentV2Quiz(
  repositoryPath: string,
  topic: ContentV2Topic,
  value: unknown,
): Promise<ContentV2Quiz> {
  const rawQuiz = value as { id?: unknown; icon?: unknown };
  const normalizedQuiz = typeof rawQuiz?.icon === "string" && rawQuiz.icon.startsWith("data:image/")
    ? { ...(value as Record<string, unknown>), icon: await saveMetadataIcon(path.join(contentRoot(repositoryPath), topic.id, "assets"), validateId(String(rawQuiz.id), "Quiz ID"), rawQuiz.icon) }
    : value;
  const quiz = contentV2QuizSchema.parse(normalizedQuiz);
  if (quiz.topicId !== topic.id)
    throw new Error("Quiz topicId does not match its parent topic.");
  assertContentV2Relationship(topic.type, quiz.type, "quiz");
  const filePath = path.join(
    contentRoot(repositoryPath),
    topic.id,
    "quizzes",
    validateId(quiz.id, "Quiz ID"),
    "quiz.json",
  );
  const existing = (await fs
    .readFile(filePath, "utf8")
    .then(JSON.parse)
    .catch(() => null)) as { type?: unknown } | null;
  if (existing?.type && existing.type !== quiz.type)
    throw new Error("A quiz type cannot be changed after creation.");
  await writeJson(filePath, quiz);
  if (quiz.type === "alphabet" || quiz.type === "spelling") {
    const dictionaryPath = sharedDictionaryPath(
      repositoryPath,
      topic.id,
    );
    if (
      !(await fs
        .access(dictionaryPath)
        .then(() => true)
        .catch(() => false))
    )
      await writeJson(dictionaryPath, { schemaVersion: 2, entries: [] });
  }
  return quiz;
}

export async function saveContentV2Question(
  repositoryPath: string,
  topic: ContentV2Topic,
  quiz: ContentV2Quiz,
  value: unknown,
): Promise<ContentV2Question> {
  const question = contentV2QuestionSchema.parse(value);
  if (quiz.topicId !== topic.id)
    throw new Error("Quiz does not belong to the selected topic.");
  assertContentV2Relationship(quiz.type, question.type, "question");
  const filePath = path.join(
    contentRoot(repositoryPath),
    topic.id,
    "quizzes",
    quiz.id,
    "questions",
    `${validateId(question.id, "Question ID")}.json`,
  );
  const existing = (await fs
    .readFile(filePath, "utf8")
    .then(JSON.parse)
    .catch(() => null)) as { type?: unknown } | null;
  if (existing?.type && existing.type !== question.type)
    throw new Error("A question type cannot be changed after creation.");
  await writeJson(filePath, question);
  return question;
}

export async function recordContentV2Published(
  filePath: string,
  publishedHash: string,
  publishedAt: string,
): Promise<void> {
  const record = (await readJson(filePath)) as Record<string, unknown>;
  record.publishedHash = publishedHash;
  record.publishedAt = publishedAt;
  await writeJson(filePath, record);
}

export async function readContentV2QuizPublishState(
  quizFilePath: string,
): Promise<ContentV2QuizPublishState> {
  const filePath = path.join(path.dirname(quizFilePath), "publish-state.json");
  const value = await fs
    .readFile(filePath, "utf8")
    .then((source) => JSON.parse(source) as unknown)
    .catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") return null;
      throw cause;
    });
  if (value === null) return { schemaVersion: 1, targets: {} };
  if (
    !value ||
    typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !(value as { targets?: unknown }).targets ||
    typeof (value as { targets?: unknown }).targets !== "object"
  )
    throw new Error("Invalid content-v2 publish-state.json.");
  return value as ContentV2QuizPublishState;
}

export async function writeContentV2QuizPublishState(
  quizFilePath: string,
  state: ContentV2QuizPublishState,
): Promise<void> {
  await writeJson(path.join(path.dirname(quizFilePath), "publish-state.json"), state);
}
