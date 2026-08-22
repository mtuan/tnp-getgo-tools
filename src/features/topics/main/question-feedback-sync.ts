import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { QuestionFeedbackSyncResult, SyncedQuestionFeedback } from "../../../shared/domain/models.js";
import {
  readFeedbackCursor,
  feedbackCursorSchemaVersion,
  findLegacyFeedbackTopic,
  hasFeedbackTarget,
  saveSyncedQuestionFeedback,
  writeFeedbackCursor,
} from "../repository/question-feedback-repository.js";

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = { name: string; fields?: Record<string, FirestoreValue> };

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return undefined;
  if ("nullValue" in value) return null;
  if (typeof value.stringValue === "string") return value.stringValue;
  if (typeof value.timestampValue === "string") return value.timestampValue;
  if (typeof value.booleanValue === "boolean") return value.booleanValue;
  if (typeof value.integerValue === "string") return Number(value.integerValue);
  if (typeof value.doubleValue === "number") return value.doubleValue;
  const array = value.arrayValue as { values?: FirestoreValue[] } | undefined;
  if (array) return (array.values ?? []).map(decodeValue);
  const map = value.mapValue as { fields?: Record<string, FirestoreValue> } | undefined;
  if (map) return Object.fromEntries(Object.entries(map.fields ?? {}).map(([key, item]) => [key, decodeValue(item)]));
  return undefined;
}

function decodeDocument(document: FirestoreDocument): Record<string, unknown> {
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

async function responseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  return new Error(payload?.error?.message ?? `Firestore returned HTTP ${response.status}.`);
}

export class QuestionFeedbackSyncService {
  constructor(private readonly auth: FirebaseAuthService) {}

  async sync(root: string): Promise<QuestionFeedbackSyncResult> {
    const { projectId } = await this.auth.publishingTarget();
    const cursor = await readFeedbackCursor(root, projectId);
    const incrementalCursor = cursor?.schemaVersion === feedbackCursorSchemaVersion ? cursor : null;
    const query: Record<string, unknown> = {
      structuredQuery: {
        from: [{ collectionId: "question-reports" }],
        orderBy: [
          { field: { fieldPath: "reportedAt" }, direction: "ASCENDING" },
          { field: { fieldPath: "__name__" }, direction: "ASCENDING" },
        ],
        ...(incrementalCursor ? { startAt: { before: false, values: [
          { timestampValue: incrementalCursor.reportedAt },
          { referenceValue: incrementalCursor.documentName },
        ] } } : {}),
      },
    };
    const { response } = await this.auth.firestoreRequest(":runQuery", {
      method: "POST",
      body: JSON.stringify(query),
    });
    if (!response.ok) throw await responseError(response);
    const rows = await response.json() as Array<{ document?: FirestoreDocument }>;
    const documents = rows.flatMap((row) => row.document ? [row.document] : []);
    let saved = 0;
    let skipped = 0;
    let nextCursor = incrementalCursor;
    for (const document of documents) {
      const data = decodeDocument(document);
      const storedTopicId = typeof data.topicId === "string" ? data.topicId : "";
      const quizId = typeof data.quizId === "string" ? data.quizId : "";
      const questionId = typeof data.questionId === "string" ? data.questionId : "";
      const reportedAt = typeof data.reportedAt === "string" ? data.reportedAt : "";
      nextCursor = reportedAt ? { reportedAt, documentName: document.name } : nextCursor;
      if (!quizId || !questionId || !reportedAt) {
        skipped += 1;
        continue;
      }
      const topicId = storedTopicId || await findLegacyFeedbackTopic(root, quizId) || "";
      if (!topicId) {
        console.warn("[GetGo Tools][Question feedback] Legacy report topic could not be resolved", { quizId, questionId, document: document.name });
        skipped += 1;
        continue;
      }
      if (!await hasFeedbackTarget(root, topicId, quizId)) {
        console.warn("[GetGo Tools][Question feedback] Local quiz not found", { topicId, quizId, questionId, document: document.name });
        skipped += 1;
        continue;
      }
      const report: SyncedQuestionFeedback = {
        schemaVersion: 1,
        id: document.name.split("/").at(-1)!,
        source: {
          projectId,
          topicId,
          quizId,
          questionId,
          issueTypes: Array.isArray(data.issueTypes)
            ? data.issueTypes.filter((value): value is string => typeof value === "string")
            : Array.isArray(data.issueType)
              ? data.issueType.filter((value): value is string => typeof value === "string")
              : typeof data.issueType === "string" ? [data.issueType] : [],
          comment: typeof data.comment === "string" ? data.comment : null,
          params: data.params && typeof data.params === "object" && !Array.isArray(data.params) ? data.params as Record<string, unknown> : null,
          reportedAt,
          reportedBy: typeof data.reportedBy === "string" ? data.reportedBy : "unknown",
        },
        review: { status: "pending", note: null, updatedAt: null },
      };
      if (await saveSyncedQuestionFeedback(root, report)) saved += 1;
      else skipped += 1;
    }
    if (nextCursor && nextCursor !== cursor) await writeFeedbackCursor(root, projectId, nextCursor);
    return { projectId, fetched: documents.length, saved, skipped, cursor: nextCursor };
  }
}
