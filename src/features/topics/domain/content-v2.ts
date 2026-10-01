import { createHash } from "node:crypto";
import { sanitizeVietnamesePronunciationQuestion } from "../../quiz-editor/domain/pronunciation-safety.js";
import { z } from "zod";
import { marketplaceTopicStates } from "./marketplace-topic-state.js";
import { isTextContentIconText, parseTextContentIcon, textContentIconColors, textContentIconThemes } from "../../../shared/domain/content-icon.js";
export { localizedText, type LocalizedText } from "../../../shared/domain/localized-text.js";
export { automaticMarketplaceTopicTags } from "../../../shared/domain/topic-search-tags.js";

// Increment when the published quiz payload or Storage layout changes so
// existing target hashes schedule one corrective sync.
// v15 enriches question image asset references with intrinsic width/height metadata.
// Bumping the contract makes existing published quiz bundles stale so their
// questions and assets are synchronized together once under the new format.
export const contentV2QuizPublishContractVersion = 15;
// Increment when topic documents or shared topic-asset publication changes.
export const contentV2TopicPublishContractVersion = 3;
export const marketplaceTopicPublishContractVersion = 2;

export {
  marketplaceTopicState,
  marketplaceTopicStates,
  withMarketplaceTopicState,
  type MarketplaceTopicState,
} from "./marketplace-topic-state.js";

export const contentV2ReviewStatuses = [
  "draft",
  "pending",
  "reviewed",
  "rejected",
] as const;
export type ContentV2ReviewStatus = (typeof contentV2ReviewStatuses)[number];

const idSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
const hashSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .optional();
export const contentSourceSchema = z.object({
  provider: z.string().min(1),
  url: z.string().url(),
  indexUrl: z.string().url().optional(),
  externalId: z.string().min(1).optional(),
  importedAt: z.string().datetime().optional(),
});
export type ContentSource = z.infer<typeof contentSourceSchema>;
export const localizedTextSchema = z.union([
  z.string(),
  z.object({ en: z.string(), vi: z.string() }),
]);
const legacyIconSchema = z.string().refine(
  (value) => value.startsWith("asset:")
    || (value.startsWith("text:") && Boolean(parseTextContentIcon(value)))
    || (value.trim().length <= 16 && /\P{ASCII}/u.test(value)),
);
const iconSchema = z.union([
  legacyIconSchema,
  z.object({
    type: z.literal("text"),
    text: z.string().refine(isTextContentIconText),
    theme: z.enum(textContentIconThemes),
  }),
  z.object({ type: z.literal("text"), text: z.string(), color: z.string().regex(/^#[0-9a-f]{6}$/i) })
    .transform(({ type, text, color }) => ({ type, text, theme: textContentIconThemes.find(theme => textContentIconColors[theme] === color.toLowerCase()) ?? "violet" as const })),
  z.object({ type: z.literal("text"), text: z.string(), backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i), textColor: z.string().optional() })
    .transform(({ type, text, backgroundColor }) => ({ type, text, theme: textContentIconThemes.find(theme => textContentIconColors[theme] === backgroundColor.toLowerCase()) ?? "violet" as const })),
]).optional();
export const marketplaceTopicMetadataSchema = z.object({
  state: z.preprocess(
    (value) => value === "removed" ? "unlisted" : value,
    z.enum(marketplaceTopicStates),
  ).optional(),
  listed: z.boolean().default(false),
  shortDescription: z.string().default(""),
  fullDescription: z.string().default(""),
  featured: z.boolean().default(false),
  preview: z.boolean().default(false),
  experimental: z.boolean().default(false),
  subjects: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  learningObjectives: z.array(localizedTextSchema).default([]),
  ageRange: z.object({
    minimum: z.number().int().min(1).optional(),
    maximum: z.number().int().min(1).optional(),
  }).optional(),
  pricing: z.object({
    type: z.enum(["free", "subscription", "paid"]).default("free"),
    amount: z.number().nonnegative().optional(),
    currency: z.string().default("VND"),
  }).default({ type: "free", currency: "VND" }),
}).passthrough();
export type MarketplaceTopicMetadata = z.infer<typeof marketplaceTopicMetadataSchema>;
export type MarketplaceTopicMetadataInput = Partial<MarketplaceTopicMetadata>;
export type MarketplaceContentAccess = "free" | "subscription" | "paid";

function enabledMarketplaceMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const enabled = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== false),
  );
  return Object.keys(enabled).length ? enabled : undefined;
}

const MARKETPLACE_SEARCH_TERM_LIMIT = 256;

function marketplaceSearchText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(marketplaceSearchText);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(marketplaceSearchText);
  return [];
}

function normalizeMarketplaceSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function marketplaceSearchTerms(values: unknown[]): string[] {
  const terms = new Set<string>();
  for (const source of values.flatMap(marketplaceSearchText)) {
    const normalized = normalizeMarketplaceSearch(source);
    const words = normalized.split(" ").filter(Boolean);
    for (const word of words) {
      for (let length = 1; length <= word.length; length += 1) terms.add(word.slice(0, length));
    }
    for (let start = 0; start < words.length; start += 1) {
      const compact = words.slice(start).join("-");
      for (let length = 1; length <= compact.length; length += 1) terms.add(compact.slice(0, length));
    }
    if (terms.size >= MARKETPLACE_SEARCH_TERM_LIMIT) break;
  }
  return [...terms].slice(0, MARKETPLACE_SEARCH_TERM_LIMIT);
}

function canonicalMarketplaceSubject(value: string): string {
  const normalized = normalizeMarketplaceSearch(value);
  return ({ math: "mathematics", maths: "mathematics", mathematics: "mathematics" } as Record<string, string>)[normalized] ?? normalized;
}

function marketplaceFilterKeys(record: ContentV2Topic, marketplace: Record<string, unknown>): string[] {
  const audiences = marketplace.experimental === true ? ["admin"] : ["public", "admin"];
  const grades = [...new Set([
    ...(record.grades ?? []).map(String),
    ...("gradeGroups" in record && Array.isArray(record.gradeGroups) ? record.gradeGroups.flatMap(group => group.grades.map(String)) : []),
  ])];
  const subjects = [...new Set([
    ...(record.subjects ?? []),
    ...("subject" in record && typeof record.subject === "string" ? [record.subject] : []),
  ].map(canonicalMarketplaceSubject).filter(Boolean))];
  const bases = audiences.flatMap(audience => [
    audience,
    ...grades.map(grade => `${audience}|g:${grade}`),
    ...subjects.map(subject => `${audience}|s:${subject}`),
    ...grades.flatMap(grade => subjects.map(subject => `${audience}|g:${grade}|s:${subject}`)),
  ]);
  const terms = marketplaceSearchTerms([marketplace.tags]);
  return [...new Set(bases.flatMap(base => [base, ...terms.map(term => `${base}|q:${term}`)]))];
}

export function marketplaceContentAccess(
  metadata: MarketplaceTopicMetadataInput | undefined,
  inherited: MarketplaceContentAccess = "free",
): MarketplaceContentAccess {
  const type = metadata?.pricing?.type;
  return type === "free" || type === "subscription" || type === "paid"
    ? type
    : inherited;
}

export function sanitizeMarketplaceQuiz(
  record: ContentV2Quiz,
  inheritedAccess: MarketplaceContentAccess,
  questionCount?: number,
  supportsDynamic?: boolean,
): Record<string, unknown> {
  const {
    sharedCode: _sharedCode,
    publishedHash: _publishedHash,
    publishedAt: _publishedAt,
    status: _status,
    ...summary
  } = contentV2QuizSchema.parse(record);
  const normalizedMarketplace = enabledMarketplaceMetadata(summary.marketplace);
  return {
    ...summary,
    marketplace: normalizedMarketplace,
    access: marketplaceContentAccess(record.marketplace, inheritedAccess),
    ...(questionCount === undefined ? {} : { questionCount }),
    ...(supportsDynamic ? { dynamic: true, supportsDynamic: true } : {}),
  };
}

export function sanitizeMarketplaceTopic(
  record: ContentV2Topic,
): Record<string, unknown> {
  const metadata = record.marketplace ?? {};
  const {
    publishedHash: _publishedHash,
    publishedAt: _publishedAt,
    ...marketplace
  } = metadata as MarketplaceTopicMetadataInput & {
    publishedHash?: string;
    publishedAt?: string;
  };
  const normalizedMarketplace = enabledMarketplaceMetadata(marketplace) ?? {};
  return {
    publishContractVersion: marketplaceTopicPublishContractVersion,
    topicId: record.id,
    title: record.title,
    description: record.description,
    icon: record.icon,
    publisherId: record.publisherId,
    publisher: record.publisher,
    ...normalizedMarketplace,
    shortDescription: record.description,
    fullDescription: record.description,
    subjects: record.subjects,
    grades: record.grades,
    order: record.order,
    filterKeys: marketplaceFilterKeys(record, normalizedMarketplace),
  };
}
const baseRecord = {
  schemaVersion: z.literal(2),
  id: idSchema,
  icon: iconSchema,
  status: z.enum(contentV2ReviewStatuses).default("draft"),
  order: z.number().int().nonnegative().default(0),
  publishedHash: hashSchema,
  publishedAt: z.string().datetime().optional(),
  publisherId: idSchema.optional(),
  publisher: z.object({
    id: idSchema,
    displayName: z.string().min(1),
    verified: z.boolean().default(false),
  }).optional(),
  marketplace: marketplaceTopicMetadataSchema.partial().passthrough().optional(),
  source: contentSourceSchema.optional(),
};

export const competitionTopicSchema = z.object({
  ...baseRecord,
  title: localizedTextSchema,
  description: localizedTextSchema.default(""),
  subjects: z.array(z.string().min(1)).default([]),
  grades: z.array(z.number().int().min(0).max(12)).default([]),
  type: z.literal("competition"),
  subject: z.string().min(1),
  rounds: z
    .array(z.object({ id: idSchema, title: localizedTextSchema }))
    .default([]),
  gradeGroups: z
    .array(
      z.object({
        id: idSchema,
        title: localizedTextSchema,
        grades: z.array(z.number().int().nonnegative()),
      }),
    )
    .default([]),
});

export const kidLearningTopicSchema = z.object({
  ...baseRecord,
  title: localizedTextSchema,
  description: localizedTextSchema.default(""),
  subjects: z.array(z.string().min(1)).default([]),
  grades: z.array(z.number().int().min(0).max(12)).default([]),
  type: z.literal("kid-learning"),
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
  kidLearningTopicSchema,
]);
export type ContentV2Topic = z.infer<typeof contentV2TopicSchema>;
export type ContentV2TopicType = ContentV2Topic["type"];

const baseQuiz = {
  ...baseRecord,
  title: z.string().min(1),
  description: z.string().default(""),
  topicId: idSchema,
  sharedCode: z.string().default(""),
};

export const defaultQuizSpeechSettings = {
  letterRate: 0.75,
  spellingRate: 0.5,
  wordRate: 0.65,
  meaningRate: 1,
  pauseMs: 500,
} as const;

const quizSpeechSettingsSchema = z.object({
  letterRate: z.number().min(0.25).max(2).default(0.75),
  spellingRate: z.number().min(0.25).max(2).default(0.5),
  wordRate: z.number().min(0.25).max(2).default(0.65),
  meaningRate: z.number().min(0.25).max(2).default(1),
  pauseMs: z.number().int().min(0).max(3000).default(500),
});

export const competitionPaperQuizSchema = z.object({
  ...baseQuiz,
  type: z.literal("competition-paper"),
  supportedLanguages: z.array(z.enum(["en", "vi"])).min(1).default(["en", "vi"]),
  grade: z.string().min(1),
  round: z.string().min(1),
  year: z.string().min(1),
});

export const alphabetQuizSchema = z.object({
  ...baseQuiz,
  type: z.literal("alphabet"),
  language: z.enum(["en", "vi"]),
  speech: quizSpeechSettingsSchema.default(defaultQuizSpeechSettings),
});

export const spellingQuizSchema = z.object({
  ...baseQuiz,
  type: z.literal("spelling"),
  language: z.enum(["en", "vi"]),
});

export const pronunciationQuizSchema = z.object({
  ...baseQuiz,
  type: z.literal("pronunciation"),
  language: z.literal("vi"),
  speech: quizSpeechSettingsSchema.default(defaultQuizSpeechSettings),
});

export const contentV2QuizSchema = z.discriminatedUnion("type", [
  competitionPaperQuizSchema,
  alphabetQuizSchema,
  spellingQuizSchema,
  pronunciationQuizSchema,
]);
export type ContentV2Quiz = z.infer<typeof contentV2QuizSchema>;
export type ContentV2QuizType = ContentV2Quiz["type"];

const questionBase = {
  schemaVersion: z.literal(2),
  id: idSchema,
  order: z.number().int().nonnegative(),
  status: z.enum(contentV2ReviewStatuses).default("pending"),
  source: contentSourceSchema.optional(),
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
    .object({ en: z.string().optional(), vi: z.string().optional() })
    .optional(),
  solutions: z.array(z.object({
    title: localizedTextSchema,
    text: localizedTextSchema,
    sourceUrl: z.string().url().optional(),
  })).optional(),
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
      compiledJs: z.string().optional(),
      quizBuilderApiVersion: z.number().int().positive().optional(),
    })
    .optional(),
  authoringMode: z.enum(["advanced-dynamic", "reference"]).optional(),
  reference: z.object({ questionNo: z.number().int().positive() }).optional(),
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
        durationSeconds: z.number().int().positive().optional(),
      }),
    )
    .default([]),
});

const pronunciationCellSchema = z.object({
  text: z.string().min(1),
  speech: z.string().optional(),
  audio: z.string().optional(),
});

const pronunciationToneCellSchema = pronunciationCellSchema.extend({
  // An empty label is the unmarked Vietnamese ngang tone.
  text: z.string(),
});

const pronunciationFormCellSchema = pronunciationCellSchema.extend({
  // Unsafe generated syllables are blanked without shifting their tone column.
  text: z.string(),
});

export const pronunciationSoundV2Schema = z.object({
  ...questionBase,
  type: z.literal("pronunciation-sound"),
  title: z.string().optional(),
  letter: pronunciationCellSchema,
  tones: z.array(pronunciationToneCellSchema),
  sounds: z.array(z.object({
    sound: pronunciationCellSchema,
    forms: z.array(pronunciationFormCellSchema),
  })).min(1),
});

export const contentV2QuestionSchema = z.discriminatedUnion("type", [
  competitionQuestionV2Schema,
  alphabetLetterV2Schema,
  pronunciationSoundV2Schema,
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
    "kid-learning": { type: "kid-learning", schemaVersion: 2 },
  },
  quizzes: {
    "competition-paper": {
      type: "competition-paper",
      schemaVersion: 2,
      allowedParentTypes: ["competition"],
    },
    alphabet: {
      type: "alphabet",
      schemaVersion: 2,
      allowedParentTypes: ["kid-learning"],
    },
    spelling: {
      type: "spelling",
      schemaVersion: 2,
      allowedParentTypes: ["kid-learning"],
    },
    pronunciation: {
      type: "pronunciation",
      schemaVersion: 2,
      allowedParentTypes: ["kid-learning"],
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
      allowedParentTypes: ["alphabet"],
    },
    "pronunciation-sound": {
      type: "pronunciation-sound",
      schemaVersion: 2,
      allowedParentTypes: ["pronunciation"],
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
  const {
    marketplace,
    publisher: _publisher,
    publisherId: _publisherId,
    ...runtime
  } = withoutAuthoringMetadata(contentV2TopicSchema.parse(record));
  return {
    ...runtime,
    access: marketplaceContentAccess(marketplace),
  };
}

export function sanitizeContentV2Quiz(
  record: ContentV2Quiz,
): Record<string, unknown> {
  const { marketplace, ...runtime } = withoutAuthoringMetadata(contentV2QuizSchema.parse(record));
  const normalizedMarketplace = enabledMarketplaceMetadata(marketplace);
  return {
    ...runtime,
    ...(normalizedMarketplace ? { marketplace: normalizedMarketplace } : {}),
  };
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
  return sanitizeVietnamesePronunciationQuestion(runtime);
}

export function hashContentV2(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
