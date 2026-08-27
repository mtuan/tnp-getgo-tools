import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  assertContentV2Relationship,
  contentV2QuizPublishContractVersion,
  contentV2QuestionSchema,
  contentV2QuizSchema,
  contentV2TopicSchema,
  hashContentV2,
  sanitizeContentV2Question,
  sanitizeContentV2Quiz,
  sanitizeContentV2Topic,
  sanitizeMarketplaceTopic,
  type ContentV2Question,
  type ContentV2Quiz,
  type ContentV2Topic,
} from "../../../features/topics/domain/content-v2.js";
import type { ContentV2QuestionSummary, ContentV2QuizSummary, ContentV2Snapshot, ContentV2TopicSummary, FileLoadIssue } from "../../../shared/domain/models.js";
import type { ContentV2QuizPublishState, ContentV2TopicPublishState } from "../../../features/topics/domain/content-v2-publish-state.js";
import { parseAlphabetDictionary, parseKidLearningDictionary, reviewedKidLearningDictionary } from "../../quiz-editor/repository/alphabet-dictionary.js";

const topicIdPattern = /^[a-z][a-z0-9-]*$/;

function sharedDictionaryPath(repositoryPath: string, topicId: string) {
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
  referenceDirectory = "icons",
): Promise<string> {
  const match =
    /^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([\s\S]+)$/.exec(dataUrl);
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
      fs.rm(path.join(assetsDirectory, `${basename}.${candidate}`), {
        force: true,
      }),
    ),
  );
  const filename = `${basename}.${extension}`;
  await fs.writeFile(
    path.join(assetsDirectory, filename),
    Buffer.from(match[2], "base64"),
  );
  return `asset:${referenceDirectory}/${filename}`;
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
  content: ContentV2Snapshot;
}

/**
 * Resolves a quiz source PDF through exact, deterministic paths only.
 * Never replace this with a repository walk: Content V2 quizzes may retain the
 * ID of their legacy quiz, whose folder name used underscores instead of dashes.
 */
export async function resolveContentV2QuizSourcePdf(
  repositoryPath: string,
  topicId: string,
  quizId: string,
): Promise<string | null> {
  const safeTopicId = validateId(topicId, "Topic ID");
  const safeQuizId = validateId(quizId, "Quiz ID");
  const legacyContestId = validateId(safeQuizId.split("-")[0], "legacy contest ID");
  const candidates = [
    path.join(contentRoot(repositoryPath), safeTopicId, "quizzes", safeQuizId, "source.pdf"),
    path.join(repositoryPath, "quizzes", legacyContestId, safeQuizId, "source.pdf"),
    path.join(repositoryPath, "quizzes", legacyContestId, safeQuizId.replaceAll("-", "_"), "source.pdf"),
  ];
  for (const candidate of candidates) {
    if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate;
  }
  return null;
}

export interface ContentV2Asset {
  reference: string;
  sourcePath: string;
  contentHash: string;
  mimeType: string;
  data: Uint8Array;
}

export async function loadContentV2WorkspaceFromFiles(
  repositoryPath: string,
  options: { lightweight?: boolean; topicId?: string; includeQuestions?: boolean; projectId?: string } = {},
): Promise<LoadedContentV2> {
  const loadStartedAt = Date.now();
  const root = contentRoot(repositoryPath);
  console.info("[GetGo Tools][Content files] Loading", { root });
  const topics: ContentV2TopicSummary[] = [];
  const quizzes: ContentV2QuizSummary[] = [];
  const questions: ContentV2QuestionSummary[] = [];
  const issues: FileLoadIssue[] = [];
  const questionKeys = new Set<string>();

  const topicDirectories = options.topicId ? [validateId(options.topicId, "Topic ID")] : await directories(root);
  for (const topicDirectoryName of topicDirectories) {
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
      const lightweight = options.lightweight === true;
      const files = options.includeQuestions === false
        ? []
        : await questionFiles(path.join(path.dirname(quizFile), "questions"));
      for (const questionFile of files) {
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
              localHash: lightweight
                ? ""
                : hashContentV2(sanitizeContentV2Question(question)),
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
      if (
        !lightweight &&
        (quiz.type === "alphabet" || quiz.type === "spelling")
      ) {
        const dictionaryPath = sharedDictionaryPath(repositoryPath, topic.id);
        try {
          resources = {
            dictionary: parseKidLearningDictionary(
              await readJson(dictionaryPath),
            ),
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
        if (lightweight) {
          assetHashes = [];
        } else {
          assetHashes = (
            await loadContentV2Assets(repositoryPath, topic.id, quiz.id, {
              quiz,
              questions: quizQuestions.map((item) => item.record),
              resources,
            })
          ).map((asset) => ({
            reference: asset.reference,
            contentHash: asset.contentHash,
          }));
        }
      } catch (cause) {
        issues.push({
          path: path.relative(repositoryPath, quizFile),
          message: cause instanceof Error ? cause.message : String(cause),
        });
      }
      const assetsDurationMs = Date.now() - assetsStartedAt;
      const targetPublishState = options.projectId
        ? (await readContentV2QuizPublishState(quizFile)).targets[options.projectId]
        : undefined;
      const localHash = lightweight
        ? targetPublishState && targetPublishState.publishContractVersion !== contentV2QuizPublishContractVersion
          ? `publish-contract-v${contentV2QuizPublishContractVersion}`
          : targetPublishState?.contentHash ?? quiz.publishedHash ?? ""
        : hashContentV2({
            publishContractVersion: contentV2QuizPublishContractVersion,
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
        sharedCode: quiz.sharedCode,
        description: quiz.description,
        status: quiz.status,
        order: quiz.order,
        filePath: quizFile,
        hasSourcePdf: options.topicId
          ? Boolean(await resolveContentV2QuizSourcePdf(repositoryPath, topic.id, quiz.id))
          : false,
        localHash,
        publishedHash: options.projectId
          ? targetPublishState?.contentHash ?? null
          : quiz.publishedHash ?? null,
        publishedAt: options.projectId
          ? targetPublishState?.publishedAt ?? null
          : quiz.publishedAt ?? null,
        marketplace: quiz.marketplace,
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
        console.info("[GetGo Tools][Content files] Slow quiz load", {
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
    const targetTopicPublishState = options.projectId
      ? (await readContentV2TopicPublishState(topicFile)).targets[options.projectId]
      : undefined;
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
      publishedHash: options.projectId
        ? targetTopicPublishState?.contentHash ?? null
        : topic.publishedHash ?? null,
      publishedAt: options.projectId
        ? targetTopicPublishState?.publishedAt ?? null
        : topic.publishedAt ?? null,
      quizCount: topicQuizzes.length,
      marketplace: topic.marketplace,
      marketplaceLocalHash: hashContentV2(sanitizeMarketplaceTopic(topic)),
      marketplacePublishedHash: options.projectId
        ? targetTopicPublishState?.marketplaceContentHash ?? null
        : typeof topic.marketplace?.publishedHash === "string" ? topic.marketplace.publishedHash : null,
      marketplacePublishedAt: options.projectId
        ? targetTopicPublishState?.publishedAt ?? null
        : typeof topic.marketplace?.publishedAt === "string" ? topic.marketplace.publishedAt : null,
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
    console.info("[GetGo Tools][Content files] Topic loaded", {
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
  console.info("[GetGo Tools][Content files] Loaded", {
    topics: topics.length,
    quizzes: quizzes.length,
    questions: questions.length,
    issues: issues.length,
    durationMs: Date.now() - loadStartedAt,
  });
  return {
    content: { topics, quizzes, questions, issues },
  };
}

export function loadContentV2TopicFolder(
  repositoryPath: string,
  topicId: string,
  options: { lightweight?: boolean; projectId?: string } = {},
): Promise<LoadedContentV2> {
  return loadContentV2WorkspaceFromFiles(repositoryPath, {
    topicId,
    lightweight: options.lightweight ?? true,
    projectId: options.projectId,
  });
}

/** Reads topic and quiz metadata directly from their folders without opening question files. */
export function loadContentV2TopicsOverview(repositoryPath: string, projectId?: string): Promise<LoadedContentV2> {
  return loadContentV2WorkspaceFromFiles(repositoryPath, {
    lightweight: true,
    includeQuestions: false,
    projectId,
  });
}

export async function saveContentV2Topic(
  repositoryPath: string,
  value: unknown,
): Promise<ContentV2Topic> {
  const rawTopic = value as { id?: unknown; icon?: unknown };
  const normalizedTopic =
    typeof rawTopic?.icon === "string" &&
    rawTopic.icon.startsWith("data:image/")
      ? {
          ...(value as Record<string, unknown>),
          icon: await saveMetadataIcon(
            path.join(
              contentRoot(repositoryPath),
              validateId(String(rawTopic.id), "Topic ID"),
              "assets",
              "icons",
            ),
            "topic",
            rawTopic.icon,
          ),
        }
      : value;
  let topic = contentV2TopicSchema.parse(normalizedTopic);
  const filePath = path.join(
    contentRoot(repositoryPath),
    validateId(topic.id, "Topic ID"),
    "topic.json",
  );
  const existing = await fs.readFile(filePath, "utf8")
    .then((source) => contentV2TopicSchema.parse(JSON.parse(source)))
    .catch(() => null);
  if (existing && hashContentV2(sanitizeContentV2Topic(existing)) !== hashContentV2(sanitizeContentV2Topic(topic))) {
    const { publishedHash: _publishedHash, publishedAt: _publishedAt, ...changed } = topic;
    topic = changed as ContentV2Topic;
  }
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
    dictionary: reviewedKidLearningDictionary(parseKidLearningDictionary(await readJson(dictionaryPath))),
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
  await invalidateTopicQuizPublishStates(repositoryPath, topicId);
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
  const normalized = (text: string) =>
    text.trim().toLocaleLowerCase(quiz.language);
  const translations = new Map(
    shared.entries.flatMap((entry) => {
      const translation = entry.translations[quiz.language];
      return translation
        ? [[normalized(translation.text), entry] as const]
        : [];
    }),
  );
  for (const entry of shared.entries) delete entry.translations[quiz.language];
  for (const word of dictionary.words) {
    const existing =
      translations.get(normalized(word.text)) ??
      shared.entries.find(
        (entry) =>
          !claimed.has(entry.id) && entry.image && entry.image === word.image,
      );
    const base =
      normalized(word.text)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "word";
    let id = existing?.id ?? base;
    for (let suffix = 2; available.has(id) && !existing; suffix += 1)
      id = `${base}-${suffix}`;
    const target = existing ?? {
      id,
      minimumAge: word.minimumAge,
      translations: {},
    };
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
  shared.entries = shared.entries.filter(
    (entry) => Object.keys(entry.translations).length > 0,
  );
  await writeJson(dictionaryPath, shared);
  await invalidateTopicQuizPublishStates(repositoryPath, topicId);
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
  quizId: string | undefined,
  content: unknown,
): Promise<ContentV2Asset[]> {
  const topicDirectory = path.join(
    contentRoot(repositoryPath),
    validateId(topicId, "Topic ID"),
  );
  const quizDirectory = quizId
    ? path.join(topicDirectory, "quizzes", validateId(quizId, "Quiz ID"))
    : null;
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
      ...(quizDirectory ? [path.resolve(quizDirectory, "assets", relativeAsset)] : []),
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
      contentV2QuestionSchema.parse(await readJson(filePath)),
    ),
  );
  questions.sort(
    (left, right) =>
      left.order - right.order || left.id.localeCompare(right.id),
  );
  const resources = await loadContentV2QuizResources(
    repositoryPath,
    topicId,
    quiz,
  );
  const assets = (
    await loadContentV2Assets(repositoryPath, topicId, quizId, {
      quiz,
      questions,
      resources,
    })
  ).map((asset) => ({
    reference: asset.reference,
    contentHash: asset.contentHash,
  }));
  return hashContentV2({
    publishContractVersion: contentV2QuizPublishContractVersion,
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
  const normalizedQuiz =
    typeof rawQuiz?.icon === "string" && rawQuiz.icon.startsWith("data:image/")
      ? {
          ...(value as Record<string, unknown>),
          icon: await saveMetadataIcon(
            path.join(contentRoot(repositoryPath), topic.id, "assets", "icons"),
            validateId(String(rawQuiz.id), "Quiz ID"),
            rawQuiz.icon,
          ),
        }
      : value;
  const parsedQuiz = contentV2QuizSchema.parse(normalizedQuiz);
  const { publishedHash: _publishedHash, publishedAt: _publishedAt, ...quiz } = parsedQuiz;
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
  await writeJson(filePath, quiz);
  await fs.rm(path.join(path.dirname(filePath), "publish-state.json"), { force: true });
  if (quiz.type === "alphabet" || quiz.type === "spelling") {
    const dictionaryPath = sharedDictionaryPath(repositoryPath, topic.id);
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
  await invalidateQuizPublished(path.join(path.dirname(path.dirname(filePath)), "quiz.json"));
  return question;
}

async function invalidateQuizPublished(quizFilePath: string): Promise<void> {
  await fs.rm(path.join(path.dirname(quizFilePath), "publish-state.json"), { force: true });
  const record = await fs.readFile(quizFilePath, "utf8")
    .then((source) => JSON.parse(source) as Record<string, unknown>)
    .catch(() => null);
  if (!record) return;
  delete record.publishedHash;
  delete record.publishedAt;
  await writeJson(quizFilePath, record);
}

async function invalidateTopicQuizPublishStates(repositoryPath: string, topicId: string): Promise<void> {
  const quizzesRoot = path.join(contentRoot(repositoryPath), validateId(topicId, "Topic ID"), "quizzes");
  await Promise.all((await directories(quizzesRoot)).map((quizId) =>
    invalidateQuizPublished(path.join(quizzesRoot, quizId, "quiz.json"))));
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

export async function clearContentV2Published(filePath: string): Promise<void> {
  const record = (await readJson(filePath)) as Record<string, unknown>;
  delete record.publishedHash;
  delete record.publishedAt;
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
  await writeJson(
    path.join(path.dirname(quizFilePath), "publish-state.json"),
    state,
  );
}

export async function readContentV2TopicPublishState(
  topicFilePath: string,
): Promise<ContentV2TopicPublishState> {
  const filePath = path.join(path.dirname(topicFilePath), "publish-state.json");
  const value = await fs.readFile(filePath, "utf8")
    .then((source) => JSON.parse(source) as unknown)
    .catch((cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") return null;
      throw cause;
    });
  if (value === null) return { schemaVersion: 1, targets: {} };
  if (!value || typeof value !== "object" ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !(value as { targets?: unknown }).targets ||
    typeof (value as { targets?: unknown }).targets !== "object")
    throw new Error("Invalid topic publish-state.json.");
  return value as ContentV2TopicPublishState;
}

export async function writeContentV2TopicPublishState(
  topicFilePath: string,
  state: ContentV2TopicPublishState,
): Promise<void> {
  await writeJson(path.join(path.dirname(topicFilePath), "publish-state.json"), state);
}
