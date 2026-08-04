import { promises as fs } from "node:fs"
import path from "node:path"
import type { AiUsageInfo, AiUsageRecord, RepositorySnapshot } from "../core/models.js"

type StoredAiRevision = {
  generatedAt?: unknown
  processingTimeMs?: unknown
  model?: unknown
  responseId?: unknown
  usage?: Record<string, unknown>
}

const numberValue = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0

export async function readAiUsage(snapshot: RepositorySnapshot): Promise<AiUsageInfo> {
  const records: AiUsageRecord[] = []
  for (const quiz of snapshot.quizzes) {
    const directory = path.join(path.dirname(quiz.manifestPath), "questions")
    const files = (await fs.readdir(directory).catch(() => [] as string[])).filter(file => /^q\d+\.json$/i.test(file))
    for (const file of files) {
      let question: Record<string, unknown>
      try { question = JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as Record<string, unknown> }
      catch { continue }
      const revisions: Array<{ kind: "generate" | "fix"; value: StoredAiRevision }> = []
      if (question.aiResponse && typeof question.aiResponse === "object") revisions.push({ kind: "generate", value: question.aiResponse as StoredAiRevision })
      if (Array.isArray(question.aiFixHistory)) for (const value of question.aiFixHistory) if (value && typeof value === "object") revisions.push({ kind: "fix", value: value as StoredAiRevision })
      for (const { kind, value } of revisions) {
        const usage = value.usage ?? {}
        records.push({
          id: `${quiz.key}:${file}:${kind}:${String(value.generatedAt ?? records.length)}`,
          kind,
          contestId: quiz.contest,
          quizId: quiz.id,
          quizTitle: quiz.title,
          questionNo: String(question.question_no ?? file.replace(/\D/g, "")),
          generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : null,
          processingTimeMs: numberValue(value.processingTimeMs),
          model: typeof value.model === "string" ? value.model : "Unknown",
          responseId: typeof value.responseId === "string" ? value.responseId : null,
          inputTokens: numberValue(usage.inputTokens),
          outputTokens: numberValue(usage.outputTokens),
          cachedInputTokens: numberValue(usage.cachedInputTokens),
          totalTokens: numberValue(usage.totalTokens),
        })
      }
    }
  }
  records.sort((a, b) => String(b.generatedAt ?? "").localeCompare(String(a.generatedAt ?? "")))
  return {
    scannedAt: new Date().toISOString(),
    records,
    totals: records.reduce((total, record) => ({
      requests: total.requests + 1,
      inputTokens: total.inputTokens + record.inputTokens,
      outputTokens: total.outputTokens + record.outputTokens,
      cachedInputTokens: total.cachedInputTokens + record.cachedInputTokens,
      totalTokens: total.totalTokens + record.totalTokens,
      processingTimeMs: total.processingTimeMs + record.processingTimeMs,
    }), { requests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0, processingTimeMs: 0 }),
  }
}
