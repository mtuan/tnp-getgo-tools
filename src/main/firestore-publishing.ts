import type {
  PublishResult,
  PublishingQuizStatus,
  PublishingSnapshot,
  QuizSummary,
  RepositorySnapshot,
} from "../core/models.js";
import type { LocalPublishPayload } from "../repositories/quiz-publishing.js";
import type { FirebaseAuthService } from "./firebase-auth.js";
import type {
  ContentV2Question,
  ContentV2Quiz,
  ContentV2Topic,
} from "../core/content-v2.js";
import {
  sanitizeContentV2Question,
  sanitizeContentV2Quiz,
  sanitizeContentV2Topic,
} from "../core/content-v2.js";
import type { ContentV2PublishResult } from "../core/models.js";
import type { ContentV2Asset } from "../repositories/content-v2-repository.js";
import path from "node:path";

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

function fieldValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(fieldValue) } };
  if (value && typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, fieldValue(item)]),
        ),
      },
    };
  }
  throw new Error(`Cannot publish unsupported value type: ${typeof value}`);
}

function fields(
  value: Record<string, unknown>,
): Record<string, FirestoreValue> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, fieldValue(item)]),
  );
}

function stringField(
  document: FirestoreDocument | null,
  key: string,
): string | null {
  const value = document?.fields?.[key]?.stringValue;
  return typeof value === "string" ? value : null;
}

function documentPath(contestId: string, quizId: string): string {
  return `/getgo-contests/${encodeURIComponent(contestId)}/quizzes/${encodeURIComponent(quizId)}`;
}

function contentV2TopicPath(topicId: string): string {
  return `/getgo-content-v2/catalog/topics/${encodeURIComponent(topicId)}`;
}

function contentV2QuizPath(topicId: string, quizId: string): string {
  return `${contentV2TopicPath(topicId)}/quizzes/${encodeURIComponent(quizId)}`;
}

async function responseError(response: Response): Promise<Error> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
  };
  return new Error(
    payload.error?.message ?? `Firestore returned HTTP ${response.status}.`,
  );
}

export class FirestorePublishingService {
  constructor(private readonly auth: FirebaseAuthService) {}

  private async getRemoteQuiz(
    contestId: string,
    quizId: string,
  ): Promise<{ projectId: string; document: FirestoreDocument | null }> {
    const { projectId, response } = await this.auth.firestoreRequest(
      documentPath(contestId, quizId),
    );
    if (response.status === 404) return { projectId, document: null };
    if (!response.ok) throw await responseError(response);
    return {
      projectId,
      document: (await response.json()) as FirestoreDocument,
    };
  }

  async reconcile(snapshot: RepositorySnapshot): Promise<PublishingSnapshot> {
    const rows: PublishingQuizStatus[] = snapshot.quizzes.map((quiz) => {
      if (!quiz.localContentHash)
        return this.errorRow(
          quiz,
          "local-error",
          new Error("This quiz has no valid cached question data to publish."),
        );
      return {
        contestId: quiz.contest,
        quizId: quiz.id,
        title: quiz.title,
        grade: quiz.grade,
        round: quiz.round,
        year: quiz.year,
        questionCount: quiz.questionCount,
        contentHash: quiz.localContentHash,
        publishedHash: quiz.publishedHash,
        publishedAt: quiz.publishedAt,
        status: !quiz.publishedHash
          ? "not-published"
          : quiz.publishedHash === quiz.localContentHash
            ? "up-to-date"
            : "changed",
      };
    });
    const target = await this.auth.publishingTarget();
    return {
      environment: target.environment,
      projectId: target.projectId,
      scannedAt: snapshot.scannedAt,
      quizzes: rows,
    };
  }

  private errorRow(
    quiz: QuizSummary,
    status: "local-error" | "remote-error",
    cause: unknown,
    local?: LocalPublishPayload,
  ): PublishingQuizStatus {
    return {
      contestId: quiz.contest,
      quizId: quiz.id,
      title: quiz.title,
      grade: quiz.grade,
      round: quiz.round,
      year: quiz.year,
      questionCount: local?.quiz.questionCount ?? quiz.questionCount,
      contentHash: local?.quiz.contentHash ?? null,
      publishedHash: quiz.publishedHash,
      publishedAt: quiz.publishedAt,
      status,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }

  async publish(
    quiz: QuizSummary,
    local: LocalPublishPayload,
  ): Promise<PublishResult> {
    const path = documentPath(quiz.contest, quiz.id);
    const remoteQuestionNames = await this.listQuestionNames(path);
    const nextNames = new Set(
      local.questions.map((question) => String(question.question_no)),
    );
    const writes: Array<Record<string, unknown>> = local.questions.map(
      (question) => ({
        update: {
          name: "",
          fields: fields(question as unknown as Record<string, unknown>),
          relativeName: `${path}/questions/${question.question_no}`,
        },
      }),
    );
    for (const name of remoteQuestionNames)
      if (!nextNames.has(name.split("/").at(-1)!))
        writes.push({ delete: name });
    for (let offset = 0; offset < writes.length; offset += 450)
      await this.commit(writes.slice(offset, offset + 450));
    const publishedAt = new Date().toISOString();
    await this.commit([
      {
        update: {
          name: "",
          relativeName: path,
          fields: fields({
            id: local.quiz.quizId,
            title: local.quiz.title,
            grade: local.quiz.grade,
            round: local.quiz.round,
            year: local.quiz.year,
            questionStorage: "subcollection",
            questionCount: local.quiz.questionCount,
            contentHash: local.quiz.contentHash,
            publishedAt,
          }),
        },
      },
    ]);
    const verified = await this.getRemoteQuiz(quiz.contest, quiz.id);
    if (
      stringField(verified.document, "contentHash") !== local.quiz.contentHash
    )
      throw new Error(
        "Firestore verification failed: the published hash does not match.",
      );
    return {
      contestId: quiz.contest,
      quizId: quiz.id,
      contentHash: local.quiz.contentHash,
      questionCount: local.quiz.questionCount,
      publishedAt,
    };
  }

  async publishContentV2Topic(
    topic: ContentV2Topic,
    contentHash: string,
    quizIds: string[],
  ): Promise<ContentV2PublishResult> {
    const publishedAt = new Date().toISOString();
    const relativeName = contentV2TopicPath(topic.id);
    await this.commit([
      {
        update: {
          name: "",
          relativeName,
          fields: fields({
            ...sanitizeContentV2Topic(topic),
            quizIds,
            contentHash,
            publishedAt,
          }),
        },
      },
    ]);
    const verified = await this.getDocument(relativeName);
    if (stringField(verified.document, "contentHash") !== contentHash)
      throw new Error(
        "Firestore verification failed: the topic hash does not match.",
      );
    return { kind: "topic", topicId: topic.id, contentHash, publishedAt };
  }

  async publishContentV2Quiz(
    topicId: string,
    quiz: ContentV2Quiz,
    questions: ContentV2Question[],
    resources: Record<string, unknown>,
    assets: ContentV2Asset[],
    contentHash: string,
  ): Promise<ContentV2PublishResult> {
    const quizPath = contentV2QuizPath(topicId, quiz.id);
    const questionPath = `${quizPath}/questions`;
    const remoteQuestionNames = await this.listQuestionNames(quizPath);
    const remoteAssetNames = await this.listDocumentNames(quizPath, "assets");
    const remoteResourceNames = await this.listDocumentNames(
      quizPath,
      "resources",
    );
    const nextNames = new Set(questions.map((question) => question.id));
    const nextAssetNames = new Set(
      assets.map((asset) => asset.reference.slice("asset:".length)),
    );
    const nextResourceNames = new Set(Object.keys(resources));
    const writes: Array<Record<string, unknown>> = questions.map(
      (question) => ({
        update: {
          name: "",
          relativeName: `${questionPath}/${encodeURIComponent(question.id)}`,
          fields: fields(sanitizeContentV2Question(question)),
        },
      }),
    );
    for (const name of remoteQuestionNames)
      if (!nextNames.has(name.split("/").at(-1)!))
        writes.push({ delete: name });
    for (const name of remoteAssetNames)
      if (!nextAssetNames.has(decodeURIComponent(name.split("/").at(-1)!)))
        writes.push({ delete: name });
    for (const name of remoteResourceNames)
      if (!nextResourceNames.has(decodeURIComponent(name.split("/").at(-1)!)))
        writes.push({ delete: name });
    for (let offset = 0; offset < assets.length; offset += 8) {
      await Promise.all(
        assets.slice(offset, offset + 8).map(async (asset) => {
          const assetId = asset.reference.slice("asset:".length);
          const storagePath = `getgo-content-v2/topics/${topicId}/assets/${asset.contentHash}-${path.basename(asset.sourcePath)}`;
          const uploaded = await this.auth.uploadStorageObject(
            storagePath,
            asset.data,
            asset.mimeType,
          );
          writes.push({
            update: {
              name: "",
              relativeName: `${quizPath}/assets/${encodeURIComponent(assetId)}`,
              fields: fields({
                id: assetId,
                storagePath,
                bucket: uploaded.bucket,
                contentHash: asset.contentHash,
                mimeType: asset.mimeType,
              }),
            },
          });
        }),
      );
    }
    for (const [resourceId, resource] of Object.entries(resources))
      writes.push({
        update: {
          name: "",
          relativeName: `${quizPath}/resources/${encodeURIComponent(resourceId)}`,
          fields: fields({ id: resourceId, data: resource }),
        },
      });
    for (let offset = 0; offset < writes.length; offset += 450)
      await this.commit(writes.slice(offset, offset + 450));
    const publishedAt = new Date().toISOString();
    await this.commit([
      {
        update: {
          name: "",
          relativeName: quizPath,
          fields: fields({
            ...sanitizeContentV2Quiz(quiz),
            questionIds: questions.map((question) => question.id),
            resourceIds: Object.keys(resources),
            assetIds: [...nextAssetNames],
            contentHash,
            publishedAt,
          }),
        },
      },
    ]);
    const verified = await this.getDocument(quizPath);
    if (stringField(verified.document, "contentHash") !== contentHash)
      throw new Error(
        "Firestore verification failed: the quiz hash does not match.",
      );
    return { kind: "quiz", topicId, quizId: quiz.id, contentHash, publishedAt };
  }

  private async getDocument(
    relativePath: string,
  ): Promise<{ projectId: string; document: FirestoreDocument | null }> {
    const { projectId, response } =
      await this.auth.firestoreRequest(relativePath);
    if (response.status === 404) return { projectId, document: null };
    if (!response.ok) throw await responseError(response);
    return {
      projectId,
      document: (await response.json()) as FirestoreDocument,
    };
  }

  private async listQuestionNames(quizPath: string): Promise<string[]> {
    return this.listDocumentNames(quizPath, "questions");
  }

  private async listDocumentNames(
    parentPath: string,
    collectionId: string,
  ): Promise<string[]> {
    const names: string[] = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({
        pageSize: "300",
        ...(pageToken ? { pageToken } : {}),
      });
      const { response } = await this.auth.firestoreRequest(
        `${parentPath}/${collectionId}?${query}`,
      );
      if (response.status === 404) return names;
      if (!response.ok) throw await responseError(response);
      const payload = (await response.json()) as {
        documents?: FirestoreDocument[];
        nextPageToken?: string;
      };
      names.push(...(payload.documents ?? []).map((document) => document.name));
      pageToken = payload.nextPageToken ?? "";
    } while (pageToken);
    return names;
  }

  private async commit(writes: Array<Record<string, unknown>>): Promise<void> {
    if (!writes.length) return;
    const readiness = await this.auth.checkReadiness();
    if (!readiness.projectId)
      throw new Error("Firebase project is not configured.");
    const prefix = `projects/${readiness.projectId}/databases/(default)/documents`;
    const normalized = writes.map((write) => {
      const update = write.update as
        | {
            name: string;
            relativeName?: string;
            fields: Record<string, FirestoreValue>;
          }
        | undefined;
      if (!update) return write;
      const { relativeName, ...document } = update;
      return { update: { ...document, name: `${prefix}${relativeName}` } };
    });
    const { response } = await this.auth.firestoreRequest(":commit", {
      method: "POST",
      body: JSON.stringify({ writes: normalized }),
    });
    if (!response.ok) throw await responseError(response);
  }
}
