import { z } from "zod"
import { contentStatuses, quizTypes } from "./models.js"

export const quizManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  legacyId: z.string().min(1),
  contest: z.string().min(1),
  title: z.string().min(1).optional(),
  icon: z.string().trim().min(1).optional(),
  type: z.enum(quizTypes).optional(),
  grade: z.string().nullable().optional(),
  round: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  status: z.enum(contentStatuses),
  source: z.object({
    format: z.string().min(1),
    rawJsonSha256: z.string(),
    quizTsSha256: z.string(),
  }),
  quizBuilderApiVersion: z.number().int().positive().optional(),
  questionStorageVersion: z.literal("questions-v1").optional(),
  publishedHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  publishedAt: z.string().optional(),
})

const roundSchema = z.object({
  roundCode: z.string().regex(/^[A-Z][A-Z0-9]*$/),
  roundName: z.string().min(1),
  description: z.string().optional(),
  hasPractice: z.boolean().optional(),
})

const gradeSchema = z.object({
  gradeName: z.string().min(1),
  grades: z.array(z.number().int().min(0).max(12)).min(1),
})

const categorySchema = z.object({
  categoryName: z.string().min(1),
  roundCodes: z.array(z.string()),
  patterns: z.array(z.string()).optional(),
  roundHint: z.string().optional(),
})

const ruleCategorySchema = z.object({
  categoryName: z.string().min(1),
  categoryNo: z.number().int().positive(),
  questionCount: z.number().int().nonnegative(),
  correctPoints: z.number(),
  wrongPoints: z.number(),
  noAnswerPoints: z.number(),
})

const quizRuleSchema = z.object({
  roundCode: z.string().min(1),
  gradeNames: z.array(z.string()).min(1),
  totalQuestions: z.number().int().positive(),
  totalPoints: z.number().nonnegative(),
  initPoints: z.number().nonnegative().optional(),
  timeLimit: z.number().int().nonnegative(),
  answerType: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  categories: z.array(ruleCategorySchema),
})

export const contestSettingsSchema = z.object({
  $schema: z.string().optional(),
  $comment: z.string().optional(),
  book: z.object({
    code: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().trim().min(1).optional(),
    subject: z.number().int().min(1).max(8),
    isActive: z.boolean().optional(),
  }),
  rounds: z.array(roundSchema),
  grades: z.array(gradeSchema),
  categories: z.array(categorySchema).optional(),
  quizRules: z.array(quizRuleSchema).optional(),
})
