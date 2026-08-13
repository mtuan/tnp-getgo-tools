import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ContestSummary,
  QuizAiMigrationJob,
  QuizManifest,
  QuizQuestionRecord,
  QuizSummary,
  RepositorySnapshot,
  ScanIssue,
} from "../../../shared/domain/models.js";
import { questionIsVerified } from "../../../features/quiz-editor/domain/question-status.js";
import { contestSettingsSchema, quizManifestSchema } from "../../../features/topics/domain/schema.js";
import { deriveDeploymentStatus } from "../../../features/deployment/domain/status.js";
import {
  hashPublishedQuiz,
  hashPublishedQuestions,
  sanitizePublishedQuestion,
} from "../../../features/topics/domain/publishing.js";
import { scanContentV2Repository } from "./content-v2-repository.js";

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readAiMigrationJob(
  directory: string,
): Promise<QuizAiMigrationJob | null> {
  try {
    const value = JSON.parse(
      await fs.readFile(path.join(directory, "ai-migration-job.json"), "utf8"),
    ) as QuizAiMigrationJob;
    return value &&
      typeof value.id === "string" &&
      typeof value.status === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}

async function readQuestionReview(
  directory: string,
  inspectRecords: boolean,
): Promise<{
  count: number;
  reviewed: number;
  errors: number;
  records: unknown[];
  contentHash: string | null;
}> {
  const entries = await fs
    .readdir(path.join(directory, "questions"), { withFileTypes: true })
    .catch(() => []);
  const files = entries.filter(
    (entry) => entry.isFile() && /^q\d+\.json$/i.test(entry.name),
  );
  if (!inspectRecords)
    return {
      count: files.length,
      reviewed: 0,
      errors: 0,
      records: [],
      contentHash: null,
    };
  const states = await Promise.all(
    files.map(async (entry) => {
      try {
        const question = JSON.parse(
          await fs.readFile(
            path.join(directory, "questions", entry.name),
            "utf8",
          ),
        ) as { status?: unknown; verified?: unknown; migrationError?: unknown };
        return {
          reviewed: questionIsVerified(question) ? 1 : 0,
          error: question.migrationError ? 1 : 0,
          record: question,
        };
      } catch {
        return { reviewed: 0, error: 1, record: null };
      }
    }),
  );
  let contentHash: string | null = null;
  if (states.length && states.every((value) => value.record)) {
    try {
      contentHash = hashPublishedQuestions(
        states.map((value) =>
          sanitizePublishedQuestion(value.record as QuizQuestionRecord),
        ),
      );
    } catch {
      /* Invalid drafts remain editable and surface as local publishing errors. */
    }
  }
  return {
    count: files.length,
    reviewed: states.reduce((total, value) => total + value.reviewed, 0),
    errors: states.reduce((total, value) => total + value.error, 0),
    records: states.flatMap((value) => (value.record ? [value.record] : [])),
    contentHash,
  };
}

async function findManifests(root: string): Promise<string[]> {
  const quizzesRoot = path.join(root, "quizzes");
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(entryPath);
        else if (entry.name === "manifest.json") found.push(entryPath);
      }),
    );
  }
  await walk(quizzesRoot);
  return found.sort();
}

function getArtifactHash(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["artifactHash", "quizJsSha256", "sha256", "hash"]) {
    if (typeof record[key] === "string") return record[key];
  }
  for (const nested of ["artifact", "build", "files"]) {
    const result = getArtifactHash(record[nested]);
    if (result) return result;
  }
  return null;
}

function getQuestionCount(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ["questionCount", "questionsCount"]) {
    if (typeof record[key] === "number") return record[key];
  }
  return null;
}

async function readGenerated(
  root: string,
  manifest: QuizManifest,
): Promise<{
  exists: boolean;
  hash: string | null;
  questionCount: number | null;
}> {
  const directory = path.join(
    root,
    "generated",
    "quizzes",
    manifest.contest,
    manifest.id,
  );
  const manifestPath = path.join(directory, "manifest.json");
  const quizJsPath = path.join(directory, "quiz.js");
  if (!(await exists(manifestPath)) || !(await exists(quizJsPath))) {
    return { exists: false, hash: null, questionCount: null };
  }
  try {
    const generated = JSON.parse(
      await fs.readFile(manifestPath, "utf8"),
    ) as unknown;
    const explicitHash = getArtifactHash(generated);
    const hash =
      explicitHash ??
      createHash("sha256")
        .update(await fs.readFile(quizJsPath))
        .digest("hex");
    return { exists: true, hash, questionCount: getQuestionCount(generated) };
  } catch {
    return { exists: true, hash: null, questionCount: null };
  }
}

async function mapQuiz(
  root: string,
  manifestPath: string,
  inspectQuestionRecords: boolean,
  onQuestions?: (quiz: QuizSummary, records: unknown[]) => void,
): Promise<QuizSummary> {
  const raw = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  const manifest = quizManifestSchema.parse(raw);
  const directory = path.dirname(manifestPath);
  const generated = await readGenerated(root, manifest);
  const review = await readQuestionReview(directory, inspectQuestionRecords);
  const splitQuestions =
    manifest.questionStorageVersion === "questions-v1" || review.count > 0;
  const stat = await fs.stat(manifestPath);
  const relativePath = path.relative(root, directory);
  let title = manifest.title ?? manifest.id;
  if (!manifest.title) {
    try {
      const source = await fs.readFile(path.join(directory, "quiz.ts"), "utf8");
      const match = source.match(/^\s*title\s*:\s*(["'])(.*?)\1\s*,/m);
      if (match?.[2]) title = match[2];
    } catch {
      /* The file-presence flags below report a missing quiz.ts. */
    }
  }
  const summary: QuizSummary = {
    key: `${manifest.contest}/${manifest.id}`,
    relativePath,
    manifestPath,
    id: manifest.id,
    legacyId: manifest.legacyId,
    contest: manifest.contest,
    title,
    icon: manifest.icon,
    type: manifest.type ?? "contest",
    language: manifest.language,
    grade: manifest.grade ?? null,
    round: manifest.round ?? null,
    year: manifest.year ?? null,
    contentStatus: manifest.status,
    deploymentStatus: deriveDeploymentStatus({
      contentStatus: manifest.status,
      hasGeneratedArtifact: generated.exists,
      localArtifactHash: generated.hash,
    }),
    hasSourcePdf: await exists(path.join(directory, "source.pdf")),
    hasRawJson: await exists(path.join(directory, "raw.json")),
    hasQuizTs: await exists(path.join(directory, "quiz.ts")),
    questionStorageVersion: splitQuestions ? "questions-v1" : "legacy",
    hasGeneratedArtifact: generated.exists,
    artifactHash: generated.hash,
    publishedHash: manifest.publishedHash ?? null,
    publishedAt: manifest.publishedAt ?? null,
    localContentHash: review.contentHash
      ? hashPublishedQuiz(
          {
            title,
            icon: manifest.icon,
            grade: manifest.grade ?? null,
            round: manifest.round ?? null,
            year: manifest.year ?? null,
          },
          review.contentHash,
        )
      : null,
    questionCount: splitQuestions ? review.count : generated.questionCount,
    reviewedQuestionCount: review.reviewed,
    migrationErrorCount: review.errors,
    aiMigrationJob: await readAiMigrationJob(directory),
    quizBuilderApiVersion: manifest.quizBuilderApiVersion ?? null,
    modifiedAt: stat.mtime.toISOString(),
  };
  onQuestions?.(summary, review.records);
  return summary;
}

async function mapContest(root: string, id: string): Promise<ContestSummary> {
  const settingsPath = path.join(root, "quizzes", id, "settings.json");
  const settings = contestSettingsSchema.parse(
    JSON.parse(await fs.readFile(settingsPath, "utf8")),
  );
  if (settings.book.code !== id)
    throw new Error(
      `Book code “${settings.book.code}” does not match directory “${id}”.`,
    );
  return {
    id,
    title: settings.book.title,
    description: settings.book.description ?? "",
    subject: settings.book.subject,
    isActive: settings.book.isActive !== false,
    settingsPath,
    settings,
  };
}

/** Read one changed contest without walking the repository. */
export const readContestSummary = mapContest;

/** Read one changed quiz without walking the repository. */
export function readQuizSummary(
  root: string,
  manifestPath: string,
  onQuestions?: (quiz: QuizSummary, records: unknown[]) => void,
): Promise<QuizSummary> {
  return mapQuiz(root, manifestPath, true, onQuestions);
}

export async function scanQuizRepository(
  repositoryPath: string,
  options: {
    inspectQuestionRecords?: boolean;
    lightweight?: boolean;
    onQuizQuestions?: (quiz: QuizSummary, records: unknown[]) => void;
  } = {},
): Promise<RepositorySnapshot> {
  const scanStartedAt = Date.now();
  const root = path.resolve(repositoryPath);
  console.info("[GetGo Tools][Repository index] Started", {
    repositoryPath: root,
  });
  if (!(await exists(path.join(root, "quizzes")))) {
    throw new Error("This folder does not contain a quizzes directory.");
  }
  const discoveryStartedAt = Date.now();
  const manifests = await findManifests(root);
  const contestIds = (
    await fs.readdir(path.join(root, "quizzes"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  console.info("[GetGo Tools][Repository index] Legacy structure discovered", {
    contests: contestIds.length,
    manifests: manifests.length,
    durationMs: Date.now() - discoveryStartedAt,
  });
  const contests: ContestSummary[] = [];
  const quizzes: QuizSummary[] = [];
  const issues: ScanIssue[] = [];
  const contestsStartedAt = Date.now();
  for (const id of contestIds) {
    try {
      contests.push(await mapContest(root, id));
    } catch (error) {
      issues.push({
        path: path.join("quizzes", id, "settings.json"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.info("[GetGo Tools][Repository index] Contest summaries loaded", {
    loaded: contests.length,
    issues: issues.length,
    durationMs: Date.now() - contestsStartedAt,
  });
  const legacyQuizzesStartedAt = Date.now();
  for (const manifestPath of manifests) {
    try {
      quizzes.push(
        await mapQuiz(
          root,
          manifestPath,
          options.inspectQuestionRecords !== false,
          options.onQuizQuestions,
        ),
      );
    } catch (error) {
      issues.push({
        path: path.relative(root, manifestPath),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  console.info("[GetGo Tools][Repository index] Legacy quiz summaries loaded", {
    loaded: quizzes.length,
    issues: issues.length,
    durationMs: Date.now() - legacyQuizzesStartedAt,
  });
  const contentV2StartedAt = Date.now();
  const contentV2 = await scanContentV2Repository(root, {
    lightweight: options.lightweight,
  });
  console.info("[GetGo Tools][Repository index] Content V2 summaries loaded", {
    topics: contentV2.snapshot.topics.length,
    quizzes: contentV2.snapshot.quizzes.length,
    questions: contentV2.snapshot.questions.length,
    issues: contentV2.snapshot.issues.length,
    durationMs: Date.now() - contentV2StartedAt,
  });
  console.info("[GetGo Tools][Repository index] Completed", {
    durationMs: Date.now() - scanStartedAt,
  });
  return {
    repositoryPath: root,
    scannedAt: new Date().toISOString(),
    contests,
    quizzes,
    issues,
    contentV2: contentV2.snapshot,
  };
}
