import { createHash } from "node:crypto";
import { z } from "zod";

export const contentV2ReviewStatuses = [
  "draft",
  "pending",
  "reviewed",
  "rejected",
] as const;
export type ContentV2ReviewStatus = (typeof contentV2ReviewStatuses)[number];

const idSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
const hashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .optional();
const baseRecord = {
  schemaVersion: z.literal(2),
  id: idSchema,
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.enum(contentV2ReviewStatuses).default("draft"),
  order: z.number().int().nonnegative().default(0),
  publishedHash: hashSchema,
  publishedAt: z.string().datetime().optional(),
};

export const competitionTopicSchema = z.object({
  ...baseRecord,
  type: z.literal("competition"),
  subject: z.string().min(1),
  rounds: z
    .array(z.object({ id: idSchema, title: z.string().min(1) }))
    .default([]),
  gradeGroups: z
    .array(
      z.object({
        id: idSchema,
        title: z.string().min(1),
        grades: z.array(z.number().int().nonnegative()),
      }),
    )
    .default([]),
});

export const alphabetLearningTopicSchema = z.object({
  ...baseRecord,
  type: z.literal("alphabet-learning"),
  supportedLanguages: z.array(z.enum(["en", "vi"])).min(1),
  recommendedAgeRange: z
    .object({
      minimum: z.number().int().min(1),
      maximum: z.number().int().min(1),
    })
    .refine(
      (value) => value.maximum >= value.minimum,
      "Maximum age must be at least minimum age.",
    ),
});

export const contentV2TopicSchema = z.discriminatedUnion("type", [
  competitionTopicSchema,
  alphabetLearningTopicSchema,
]);
export type ContentV2Topic = z.infer<typeof contentV2TopicSchema>;
export type ContentV2TopicType = ContentV2Topic["type"];

const baseQuiz = {
  ...baseRecord,
  topicId: idSchema,
};

export const competitionPaperQuizSchema = z.object({
  ...baseQuiz,
  type: z.literal("competition-paper"),
  grade: z.string().min(1),
  round: z.string().min(1),
  year: z.string().min(1),
});

export const alphabetCourseQuizSchema = z.object({
  ...baseQuiz,
  type: z.literal("alphabet-course"),
  language: z.enum(["en", "vi"]),
  dictionary: z.string().default("resources/dictionary.json"),
});

export const contentV2QuizSchema = z.discriminatedUnion("type", [
  competitionPaperQuizSchema,
  alphabetCourseQuizSchema,
]);
export type ContentV2Quiz = z.infer<typeof contentV2QuizSchema>;
export type ContentV2QuizType = ContentV2Quiz["type"];

const questionBase = {
  schemaVersion: z.literal(2),
  id: idSchema,
  order: z.number().int().nonnegative(),
  status: z.enum(contentV2ReviewStatuses).default("pending"),
};

export const competitionQuestionV2Schema = z.object({
  ...questionBase,
  type: z.literal("competition-question"),
  category: z.string().optional(),
  text: z.object({
    en: z.union([z.string(), z.array(z.string())]),
    vi: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  assets: z.array(z.string().startsWith("asset:")).default([]),
  answer: z.record(z.unknown()),
  explanation: z
    .object({ en: z.string(), vi: z.string().optional() })
    .optional(),
  feedback: z
    .object({
      issues: z.array(
        z.enum(["missing-image", "wrong-question", "wrong-answer"]),
      ),
      note: z.string().optional(),
      updatedAt: z.string().datetime(),
    })
    .optional(),
  dynamic: z
    .object({
      paramsGeneratorTs: z.string(),
      questionGeneratorTs: z.string(),
      originParamsTs: z.string(),
      explanationGeneratorTs: z.string(),
    })
    .optional(),
});

export const alphabetLetterV2Schema = z.object({
  ...questionBase,
  type: z.literal("alphabet-letter"),
  letter: z.string().min(1),
  uppercase: z.string().min(1),
  lowercase: z.string().min(1),
  pronunciation: z.string().optional(),
  resources: z
    .array(
      z.object({
        id: idSchema,
        title: z.string().min(1),
        url: z.string().url(),
        description: z.string().optional(),
      }),
    )
    .default([]),
});

export const contentV2QuestionSchema = z.discriminatedUnion("type", [
  competitionQuestionV2Schema,
  alphabetLetterV2Schema,
]);
export type ContentV2Question = z.infer<typeof contentV2QuestionSchema>;
export type ContentV2QuestionType = ContentV2Question["type"];

export interface ContentTypeDefinition {
  type: string;
  allowedParentTypes?: readonly string[];
  schemaVersion: 2;
}

export const contentV2Registry = {
  topics: {
    competition: { type: "competition", schemaVersion: 2 },
    "alphabet-learning": { type: "alphabet-learning", schemaVersion: 2 },
  },
  quizzes: {
    "competition-paper": {
      type: "competition-paper",
      schemaVersion: 2,
      allowedParentTypes: ["competition"],
    },
    "alphabet-course": {
      type: "alphabet-course",
      schemaVersion: 2,
      allowedParentTypes: ["alphabet-learning"],
    },
  },
  questions: {
    "competition-question": {
      type: "competition-question",
      schemaVersion: 2,
      allowedParentTypes: ["competition-paper"],
    },
    "alphabet-letter": {
      type: "alphabet-letter",
      schemaVersion: 2,
      allowedParentTypes: ["alphabet-course"],
    },
  },
} as const satisfies Record<string, Record<string, ContentTypeDefinition>>;

export function assertContentV2Relationship(
  parentType: string,
  childType: string,
  level: "quiz" | "question",
): void {
  const definitions: Record<string, ContentTypeDefinition> =
    level === "quiz" ? contentV2Registry.quizzes : contentV2Registry.questions;
  const definition = definitions[childType];
  if (!definition?.allowedParentTypes?.includes(parentType)) {
    throw new Error(`${childType} is not allowed inside ${parentType}.`);
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function withoutAuthoringMetadata<T extends Record<string, unknown>>(
  record: T,
): Omit<T, "status" | "publishedHash" | "publishedAt"> {
  const {
    status: _status,
    publishedHash: _publishedHash,
    publishedAt: _publishedAt,
    ...runtime
  } = record;
  return runtime;
}

export function sanitizeContentV2Topic(
  record: ContentV2Topic,
): Record<string, unknown> {
  return withoutAuthoringMetadata(contentV2TopicSchema.parse(record));
}

export function sanitizeContentV2Quiz(
  record: ContentV2Quiz,
): Record<string, unknown> {
  return withoutAuthoringMetadata(contentV2QuizSchema.parse(record));
}

export function sanitizeContentV2Question(
  record: ContentV2Question,
): Record<string, unknown> {
  const {
    status: _status,
    feedback: _feedback,
    ...runtime
  } = contentV2QuestionSchema.parse(record) as ContentV2Question & {
    feedback?: unknown;
  };
  return runtime;
}

export function hashContentV2(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
