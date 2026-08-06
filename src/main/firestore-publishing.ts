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
import type { ContentV2QuizPublishPreview } from "../core/models.js";
import {
  contentV2PublishedItems,
  diffContentV2PublishedItems,
  publishedItemKey,
  type ContentV2PublishTargetState,
} from "../core/content-v2-publish-state.js";
import type { ContentV2Asset } from "../repositories/content-v2-repository.js";

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

export function createContentV2QuizPublishPreview(
  topicId: string,
  quiz: ContentV2Quiz,
  questions: ContentV2Question[],
  resources: Record<string, unknown>,
  assets: ContentV2Asset[],
  contentHash: string,
): ContentV2QuizPublishPreview {
  const quizPath = contentV2QuizPath(topicId, quiz.id);
  return {
    firestore: {
      quizDocument: {
        operation: "upsert",
        path: quizPath,
        data: {
          ...sanitizeContentV2Quiz(quiz),
          contentHash,
          publishedAt: "<generated at publish time>",
        },
      },
      questionDocuments: questions.map((question) => ({
        operation: "upsert",
        path: `${quizPath}/questions/${encodeURIComponent(question.id)}`,
        data: sanitizeContentV2Question(question),
      })),
      resourceDocuments: Object.entries(resources).map(([id, data]) => ({
        operation: "upsert",
        path: `${quizPath}/resources/${encodeURIComponent(id)}`,
        data: { id, data },
      })),
      cleanup: [
        `${quizPath}/questions/* not present in questionDocuments`,
        `${quizPath}/resources/* not present in resourceDocuments`,
        `${quizPath}/assets/* legacy asset documents`,
      ],
    },
    firebaseStorage: {
      uploads: assets.map((asset) => {
        const reference = asset.reference.slice("asset:".length);
        return {
          operation: "upload",
          reference: asset.reference,
          localSourcePath: asset.sourcePath,
          destinationPath: `getgo-content-v2/topics/${topicId}/quizzes/${quiz.id}/assets/${reference.replaceAll("\\", "/")}`,
          contentHash: asset.contentHash,
          mimeType: asset.mimeType,
        };
      }),
    },
  };
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
    control?: { checkpoint(): Promise<void> },
  ): Promise<PublishResult> {
    await control?.checkpoint();
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
      {
      await control?.checkpoint();
      await this.commit(writes.slice(offset, offset + 450));
      }
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
    await control?.checkpoint();
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
    previousState?: ContentV2PublishTargetState,
    control?: { checkpoint(): Promise<void> },
  ): Promise<ContentV2PublishResult & {
    environment: string;
    projectId: string;
    items: ContentV2PublishTargetState["items"];
    changedItemCount: number;
    removedItemCount: number;
  }> {
    await control?.checkpoint();
    const target = await this.auth.publishingTarget();
    const preview = createContentV2QuizPublishPreview(
      topicId,
      quiz,
      questions,
      resources,
      assets,
      contentHash,
    );
    const items = contentV2PublishedItems(preview);
    const diff = diffContentV2PublishedItems(previousState?.items, items);
    const quizPath = preview.firestore.quizDocument.path;
    const [remoteQuestionNames, remoteAssetNames, remoteResourceNames] = previousState
      ? [[], [], []]
      : await Promise.all([
          this.listQuestionNames(quizPath),
          this.listDocumentNames(quizPath, "assets"),
          this.listDocumentNames(quizPath, "resources"),
        ]);
    const nextNames = new Set(questions.map((question) => question.id));
    const nextResourceNames = new Set(Object.keys(resources));
    const writes: Array<Record<string, unknown>> = preview.firestore.questionDocuments
      .filter((document) => diff.changed.has(publishedItemKey({ kind: "firestore-document", path: document.path })))
      .map((document) => ({
        update: {
          name: "",
          relativeName: document.path,
          fields: fields(document.data),
        },
      }),
    );
    for (const name of remoteQuestionNames)
      if (!nextNames.has(name.split("/").at(-1)!))
        writes.push({ delete: name });
    for (const name of remoteAssetNames) writes.push({ delete: name });
    for (const name of remoteResourceNames)
      if (!nextResourceNames.has(decodeURIComponent(name.split("/").at(-1)!)))
        writes.push({ delete: name });
    for (const item of diff.removed)
      if (item.kind === "firestore-document") writes.push({ delete: item.path });
    for (let offset = 0; offset < assets.length; offset += 8) {
      await Promise.all(
        assets.slice(offset, offset + 8).map(async (asset, batchIndex) => {
          await control?.checkpoint();
          const previewAsset = preview.firebaseStorage.uploads[offset + batchIndex];
          if (!diff.changed.has(publishedItemKey({ kind: "storage-object", path: previewAsset.destinationPath }))) return;
          await this.auth.uploadStorageObject(
            previewAsset.destinationPath,
            asset.data,
            asset.mimeType,
          );
        }),
      );
    }
    await Promise.all(
      diff.removed
        .filter((item) => item.kind === "storage-object")
        .map(async (item) => { await control?.checkpoint(); await this.auth.deleteStorageObject(item.path); }),
    );
    for (const document of preview.firestore.resourceDocuments)
      if (diff.changed.has(publishedItemKey({ kind: "firestore-document", path: document.path })))
      writes.push({
        update: {
          name: "",
          relativeName: document.path,
          fields: fields(document.data),
        },
      });
    for (let offset = 0; offset < writes.length; offset += 450)
      {
      await control?.checkpoint();
      await this.commit(writes.slice(offset, offset + 450));
      }
    const publishedAt = diff.changed.size || diff.removed.length
      ? new Date().toISOString()
      : previousState?.publishedAt ?? new Date().toISOString();
    if (diff.changed.has(publishedItemKey({ kind: "firestore-document", path: quizPath })))
      {
      await control?.checkpoint();
      await this.commit([
        {
          update: {
            name: "",
            relativeName: quizPath,
            fields: fields({
              ...preview.firestore.quizDocument.data,
              publishedAt,
            }),
          },
        },
      ]);
      }
    await control?.checkpoint();
    const verified = await this.getDocument(quizPath);
    if (stringField(verified.document, "contentHash") !== contentHash)
      throw new Error(
        "Firestore verification failed: the quiz hash does not match.",
      );
    return {
      kind: "quiz",
      topicId,
      quizId: quiz.id,
      contentHash,
      publishedAt,
      environment: target.environment,
      projectId: target.projectId,
      items,
      changedItemCount: diff.changed.size,
      removedItemCount: diff.removed.length,
    };
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
      if (!update) {
        const deletion = write.delete;
        return typeof deletion === "string" && deletion.startsWith("/")
          ? { delete: `${prefix}${deletion}` }
          : write;
      }
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
