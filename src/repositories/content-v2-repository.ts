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

interface CachedQuizHashInput {
  quiz: ContentV2Quiz;
  questions: Map<string, ContentV2Question>;
  resources: Record<string, unknown>;
  assets: Array<{ reference: string; contentHash: string }>;
}

const cachedQuizHashInputs = new Map<string, CachedQuizHashInput>();

function quizCacheKey(repositoryPath: string, topicId: string, quizId: string) {
  return `${path.resolve(repositoryPath)}\0${topicId}\0${quizId}`;
}

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

function hashCachedQuiz(input: CachedQuizHashInput): string {
  const questions = [...input.questions.values()].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  return hashContentV2({
    quiz: sanitizeContentV2Quiz(input.quiz),
    questions: questions.map(sanitizeContentV2Question),
    resources: input.resources,
    assets: input.assets,
  });
}

export function cachedContentV2QuizHash(
  repositoryPath: string,
  topicId: string,
  quizId: string,
): string | null {
  const input = cachedQuizHashInputs.get(
    quizCacheKey(repositoryPath, topicId, quizId),
  );
  return input ? hashCachedQuiz(input) : null;
}

export function removeCachedContentV2Question(
  repositoryPath: string,
  topicId: string,
  quizId: string,
  questionId: string,
): string | null {
  const input = cachedQuizHashInputs.get(
    quizCacheKey(repositoryPath, topicId, quizId),
  );
  if (!input) return null;
  input.questions.delete(questionId);
  return hashCachedQuiz(input);
}

export function removeCachedContentV2Quiz(
  repositoryPath: string,
  topicId: string,
  quizId: string,
) {
  cachedQuizHashInputs.delete(quizCacheKey(repositoryPath, topicId, quizId));
}

export function removeCachedContentV2Topic(
  repositoryPath: string,
  topicId: string,
) {
  const prefix = `${path.resolve(repositoryPath)}\0${topicId}\0`;
  for (const key of cachedQuizHashInputs.keys())
    if (key.startsWith(prefix)) cachedQuizHashInputs.delete(key);
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
  topicRecords: Map<string, ContentV2Topic>;
  quizRecords: Map<string, ContentV2Quiz>;
  questionRecords: Map<string, ContentV2Question>;
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
  const cachePrefix = `${path.resolve(repositoryPath)}\0`;
  for (const key of cachedQuizHashInputs.keys())
    if (key.startsWith(cachePrefix)) cachedQuizHashInputs.delete(key);
  const root = contentRoot(repositoryPath);
  const topics: ContentV2TopicSummary[] = [];
  const quizzes: ContentV2QuizSummary[] = [];
  const questions: ContentV2QuestionSummary[] = [];
  const issues: ScanIssue[] = [];
  const topicRecords = new Map<string, ContentV2Topic>();
  const quizRecords = new Map<string, ContentV2Quiz>();
  const questionRecords = new Map<string, ContentV2Question>();

  for (const topicDirectoryName of await directories(root)) {
    const topicFile = path.join(root, topicDirectoryName, "topic.json");
    let topic: ContentV2Topic;
    try {
      topic = contentV2TopicSchema.parse(await readJson(topicFile));
      if (topic.id !== topicDirectoryName)
        throw new Error(
          `Topic ID “${topic.id}” does not match directory “${topicDirectoryName}”.`,
        );
      topicRecords.set(topic.id, topic);
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
        quizRecords.set(`${topic.id}/${quiz.id}`, quiz);
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
      for (const questionFile of await questionFiles(
        path.join(path.dirname(quizFile), "questions"),
      )) {
        try {
          const question = contentV2QuestionSchema.parse(
            await readJson(questionFile),
          );
          assertContentV2Relationship(quiz.type, question.type, "question");
          const key = `${topic.id}/${quiz.id}/${question.id}`;
          if (questionRecords.has(key))
            throw new Error(
              `Question ID “${question.id}” occurs more than once.`,
            );
          questionRecords.set(key, question);
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
      let resources: Record<string, unknown> = {};
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
      let assetHashes: Array<{ reference: string; contentHash: string }> = [];
      try {
        assetHashes = (
          await loadContentV2Assets(repositoryPath, topic.id, quiz.id, {
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
      const localHash = hashContentV2({
        quiz: sanitizeContentV2Quiz(quiz),
        questions: quizQuestions.map((item) =>
          sanitizeContentV2Question(item.record),
        ),
        resources,
        assets: assetHashes,
      });
      cachedQuizHashInputs.set(quizCacheKey(repositoryPath, topic.id, quiz.id), {
        quiz,
        questions: new Map(
          quizQuestions.map((item) => [item.record.id, item.record]),
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
    }
    topicQuizzes.sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
    topics.push({
      id: topic.id,
      type: topic.type,
      title: topic.title,
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
  return {
    snapshot: { topics, quizzes, questions, issues },
    topicRecords,
    quizRecords,
    questionRecords,
  };
}

export async function saveContentV2Topic(
  repositoryPath: string,
  value: unknown,
): Promise<ContentV2Topic> {
  const topic = contentV2TopicSchema.parse(value);
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
  for (const cached of cachedQuizHashInputs.values()) {
    if (cached.quiz.topicId === topicId && (cached.quiz.type === "alphabet" || cached.quiz.type === "spelling"))
      cached.resources = { ...cached.resources, dictionary };
  }
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
  for (const cached of cachedQuizHashInputs.values()) {
    if (cached.quiz.topicId === topicId && (cached.quiz.type === "alphabet" || cached.quiz.type === "spelling"))
      cached.resources = { ...cached.resources, dictionary: shared };
  }
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

export async function saveContentV2Quiz(
  repositoryPath: string,
  topic: ContentV2Topic,
  value: unknown,
): Promise<ContentV2Quiz> {
  const quiz = contentV2QuizSchema.parse(value);
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
  const cached = cachedQuizHashInputs.get(
    quizCacheKey(repositoryPath, topic.id, quiz.id),
  );
  if (cached) cached.quiz = quiz;
  else
    cachedQuizHashInputs.set(quizCacheKey(repositoryPath, topic.id, quiz.id), {
      quiz,
      questions: new Map(),
      resources:
        quiz.type === "alphabet" || quiz.type === "spelling"
          ? { dictionary: { schemaVersion: 2, entries: [] } }
          : {},
      assets: [],
    });
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
  const cached = cachedQuizHashInputs.get(
    quizCacheKey(repositoryPath, topic.id, quiz.id),
  );
  if (cached) cached.questions.set(question.id, question);
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
