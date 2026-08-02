import { z } from "zod"
import { contentStatuses } from "./models.js"

export const quizManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  legacyId: z.string().min(1),
  contest: z.string().min(1),
  title: z.string().min(1).optional(),
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
})
