import type { PublishResult, PublishingQuizStatus, PublishingSnapshot, QuizSummary, RepositorySnapshot } from "../core/models.js"
import { createLocalPublishPayload, type LocalPublishPayload } from "../repositories/quiz-publishing.js"
import type { FirebaseAuthService } from "./firebase-auth.js"

type FirestoreValue = Record<string, unknown>
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> }

function fieldValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null }
  if (typeof value === "string") return { stringValue: value }
  if (typeof value === "boolean") return { booleanValue: value }
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fieldValue) } }
  if (value && typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).map(([key, item]) => [key, fieldValue(item)])) } }
  }
  throw new Error(`Cannot publish unsupported value type: ${typeof value}`)
}

function fields(value: Record<string, unknown>): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, fieldValue(item)]))
}

function stringField(document: FirestoreDocument | null, key: string): string | null {
  const value = document?.fields?.[key]?.stringValue
  return typeof value === "string" ? value : null
}

function documentPath(contestId: string, quizId: string): string {
  return `/getgo-contests/${encodeURIComponent(contestId)}/quizzes/${encodeURIComponent(quizId)}`
}

async function responseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }
  return new Error(payload.error?.message ?? `Firestore returned HTTP ${response.status}.`)
}

export class FirestorePublishingService {
  constructor(private readonly auth: FirebaseAuthService) {}

  private async getRemoteQuiz(contestId: string, quizId: string): Promise<{ projectId: string; document: FirestoreDocument | null }> {
    const { projectId, response } = await this.auth.firestoreRequest(documentPath(contestId, quizId))
    if (response.status === 404) return { projectId, document: null }
    if (!response.ok) throw await responseError(response)
    return { projectId, document: await response.json() as FirestoreDocument }
  }

  async reconcile(snapshot: RepositorySnapshot): Promise<PublishingSnapshot> {
    const rows: PublishingQuizStatus[] = []
    for (const quiz of snapshot.quizzes) {
      let local: LocalPublishPayload
      try { local = await createLocalPublishPayload(quiz) }
      catch (cause) {
        rows.push(this.errorRow(quiz, "local-error", cause))
        continue
      }
      rows.push({
        ...local.quiz,
        publishedHash: quiz.publishedHash,
        publishedAt: quiz.publishedAt,
        status: !quiz.publishedHash ? "not-published" : quiz.publishedHash === local.quiz.contentHash ? "up-to-date" : "changed",
      })
    }
    const readiness = await this.auth.checkReadiness()
    return { environment: readiness.environment, projectId: readiness.projectId ?? "", scannedAt: new Date().toISOString(), quizzes: rows }
  }

  private errorRow(quiz: QuizSummary, status: "local-error" | "remote-error", cause: unknown, local?: LocalPublishPayload): PublishingQuizStatus {
    return {
      contestId: quiz.contest, quizId: quiz.id, title: quiz.title, grade: quiz.grade, round: quiz.round, year: quiz.year,
      questionCount: local?.quiz.questionCount ?? quiz.questionCount, contentHash: local?.quiz.contentHash ?? null,
      publishedHash: quiz.publishedHash, publishedAt: quiz.publishedAt, status, error: cause instanceof Error ? cause.message : String(cause),
    }
  }

  async publish(quiz: QuizSummary): Promise<PublishResult> {
    const local = await createLocalPublishPayload(quiz)
    const path = documentPath(quiz.contest, quiz.id)
    const remoteQuestionNames = await this.listQuestionNames(path)
    const nextNames = new Set(local.questions.map(question => String(question.question_no)))
    const writes: Array<Record<string, unknown>> = local.questions.map(question => ({
      update: { name: "", fields: fields(question as unknown as Record<string, unknown>), relativeName: `${path}/questions/${question.question_no}` },
    }))
    for (const name of remoteQuestionNames) if (!nextNames.has(name.split("/").at(-1)!)) writes.push({ delete: name })
    for (let offset = 0; offset < writes.length; offset += 450) await this.commit(writes.slice(offset, offset + 450))
    const publishedAt = new Date().toISOString()
    await this.commit([{ update: { name: "", relativeName: path, fields: fields({
      id: local.quiz.quizId,
      title: local.quiz.title,
      grade: local.quiz.grade,
      round: local.quiz.round,
      year: local.quiz.year,
      questionStorage: "subcollection",
      questionCount: local.quiz.questionCount,
      contentHash: local.quiz.contentHash,
      publishedAt,
    }) } }])
    const verified = await this.getRemoteQuiz(quiz.contest, quiz.id)
    if (stringField(verified.document, "contentHash") !== local.quiz.contentHash) throw new Error("Firestore verification failed: the published hash does not match.")
    return { contestId: quiz.contest, quizId: quiz.id, contentHash: local.quiz.contentHash, questionCount: local.quiz.questionCount, publishedAt }
  }

  private async listQuestionNames(quizPath: string): Promise<string[]> {
    const names: string[] = []
    let pageToken = ""
    do {
      const query = new URLSearchParams({ pageSize: "300", ...(pageToken ? { pageToken } : {}) })
      const { response } = await this.auth.firestoreRequest(`${quizPath}/questions?${query}`)
      if (response.status === 404) return names
      if (!response.ok) throw await responseError(response)
      const payload = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string }
      names.push(...(payload.documents ?? []).map(document => document.name))
      pageToken = payload.nextPageToken ?? ""
    } while (pageToken)
    return names
  }

  private async commit(writes: Array<Record<string, unknown>>): Promise<void> {
    if (!writes.length) return
    const readiness = await this.auth.checkReadiness()
    if (!readiness.projectId) throw new Error("Firebase project is not configured.")
    const prefix = `projects/${readiness.projectId}/databases/(default)/documents`
    const normalized = writes.map(write => {
      const update = write.update as { name: string; relativeName?: string; fields: Record<string, FirestoreValue> } | undefined
      if (!update) return write
      const { relativeName, ...document } = update
      return { update: { ...document, name: `${prefix}${relativeName}` } }
    })
    const { response } = await this.auth.firestoreRequest(":commit", { method: "POST", body: JSON.stringify({ writes: normalized }) })
    if (!response.ok) throw await responseError(response)
  }
}
