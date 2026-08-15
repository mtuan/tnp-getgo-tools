import type { PublishResult, QuizSummary } from "../../../shared/domain/models.js";
import type { LocalPublishPayload } from "../repository/quiz-publishing.js";
import type { FirebaseAuthService } from "../../authentication/main/firebase-auth.js";
import type { ContentV2Question, ContentV2Quiz, ContentV2Topic } from "../../../features/topics/domain/content-v2.js";
import {
  sanitizeContentV2Question,
  sanitizeContentV2Quiz,
  sanitizeContentV2Topic,
} from "../../../features/topics/domain/content-v2.js";
import { marketplaceTopicState } from "../../../features/topics/domain/marketplace-topic-state.js";
import type { ContentV2PublishResult, ContentV2QuizPublishPreview, ContentV2TopicPublishPreview } from "../../../shared/domain/models.js";
import {
  contentV2PublishedItems,
  diffContentV2PublishedItems,
  publishedItemKey,
  type ContentV2PublishTargetState,
} from "../../../features/topics/domain/content-v2-publish-state.js";
import type { ContentV2Asset } from "../repository/content-v2-repository.js";
import type { PublishJobControl } from "../../jobs/main/publish-jobs.js";
import { stalePublishedQuizIds } from "../../../features/topics/domain/content-v2-publish-policy.js";

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

function marketplaceTopicPath(topicId: string): string {
  return `/getgo-marketplace-topics/${encodeURIComponent(topicId)}`;
}

function firestoreReferenceValue(projectId: string, relativePath: string): FirestoreValue {
  return {
    referenceValue: `projects/${projectId}/databases/(default)/documents${relativePath}`,
  };
}

/**
 * Build one deterministic, CSP-safe JavaScript value containing every
 * published question. JSON arrays are valid JavaScript expressions, so the
 * Web runtime can decode this without eval while individual question
 * documents remain the canonical inspectable records.
 */
export function buildContentV2QuestionsCode(
  questions: ContentV2Question[],
): string {
  return JSON.stringify(
    [...questions]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(sanitizeContentV2Question),
  );
}

function contentV2QuizPath(topicId: string, quizId: string): string {
  return `${contentV2TopicPath(topicId)}/quizzes/${encodeURIComponent(quizId)}`;
}

export function createContentV2TopicPublishPreview(
  topic: ContentV2Topic,
  contentHash: string,
  quizIds: string[],
): ContentV2TopicPublishPreview {
  return {
    firestore: {
      topicDocument: {
        operation: "upsert",
        path: contentV2TopicPath(topic.id),
        data: {
          ...sanitizeContentV2Topic(topic),
          catalogRef: marketplaceTopicPath(topic.id),
          quizIds,
          contentHash,
          publishedAt: "<generated at publish time>",
        },
      },
    },
    firebaseStorage: { uploads: [] },
  };
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
          questionsCodeFormat: "getgo.questions.v1",
          questionsCode: buildContentV2QuestionsCode(questions),
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
        path: `${contentV2TopicPath(topicId)}/resources/${encodeURIComponent(id)}`,
        data: {
          id,
          data,
        },
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
          destinationPath: `getgo-content-v2/topics/${topicId}/assets/${reference.replaceAll("\\", "/")}`,
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

  async publish(
    quiz: QuizSummary,
    local: LocalPublishPayload,
    control?: PublishJobControl,
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
      ...(local.contest ? [{
        update: {
          name: "",
          relativeName: `/getgo-contests/${encodeURIComponent(local.contest.id)}`,
          fields: fields({
            name: local.contest.id,
            displayName: local.contest.title,
            description: local.contest.description,
            icon: local.contest.icon,
            image: local.contest.icon,
            subject: local.contest.subject,
            isActive: local.contest.isActive,
            _settings: local.contest.settings,
          }),
        },
      }] : []),
      {
        update: {
          name: "",
          relativeName: path,
          fields: fields({
            id: local.quiz.quizId,
            title: local.quiz.title,
            icon: local.quiz.icon,
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
    control?: PublishJobControl,
  ): Promise<ContentV2PublishResult> {
    const publishedAt = new Date().toISOString();
    const relativeName = contentV2TopicPath(topic.id);
    const target = await this.auth.publishingTarget();
    const topicFields = fields({
      ...sanitizeContentV2Topic(topic),
      quizIds,
      contentHash,
      publishedAt,
    });
    topicFields.catalogRef = firestoreReferenceValue(
      target.projectId,
      marketplaceTopicPath(topic.id),
    );
    await control?.checkpoint();
    await this.commit([
      {
        update: {
          name: "",
          relativeName,
          fields: topicFields,
        },
      },
    ]);
    await control?.advance("Published containing topic document");
    await control?.checkpoint();
    const verified = await this.getDocument(relativeName);
    if (stringField(verified.document, "contentHash") !== contentHash)
      throw new Error(
        "Firestore verification failed: the topic hash does not match.",
      );
    await control?.advance("Verified containing topic document");
    return { kind: "topic", topicId: topic.id, contentHash, publishedAt };
  }

  async uploadContentV2TopicAssets(
    topicId: string,
    assets: ContentV2Asset[],
    control?: PublishJobControl,
  ): Promise<void> {
    for (const asset of assets) {
      await control?.checkpoint();
      const reference = asset.reference.slice("asset:".length).replaceAll("\\", "/");
      await this.auth.uploadStorageObject(
        `getgo-content-v2/topics/${topicId}/assets/${reference}`,
        asset.data,
        asset.mimeType,
      );
    }
  }

  async contentV2TopicExists(topicId: string): Promise<boolean> {
    const result = await this.getDocument(contentV2TopicPath(topicId));
    return result.document !== null;
  }

  async publishMarketplaceTopic(
    topic: ContentV2Topic,
    contentHash: string,
  ): Promise<ContentV2PublishResult> {
    const publishedAt = new Date().toISOString();
    const relativeName = marketplaceTopicPath(topic.id);
    await this.commit([{ update: { name: "", relativeName, fields: fields({
      topicId: topic.id,
      title: topic.title,
      description: topic.description,
      icon: topic.icon,
      publisherId: topic.publisherId,
      publisher: topic.publisher,
      ...topic.marketplace,
      contentHash,
      publishedAt,
    }) } }]);
    return { kind: "topic", topicId: topic.id, contentHash, publishedAt };
  }

  async removeMarketplaceTopic(topicId: string): Promise<void> {
    await this.commit([{ delete: marketplaceTopicPath(topicId) }]);
  }

  async removeContentV2Topic(topicId: string, control?: PublishJobControl): Promise<void> {
    const quizIds = (await this.listDocumentNames(contentV2TopicPath(topicId), "quizzes"))
      .map((name) => decodeURIComponent(name.split("/").at(-1)!));
    await this.deleteContentV2TopicQuizzes(topicId, quizIds, control);
    await control?.checkpoint();
    await this.commit([
      { delete: contentV2TopicPath(topicId) },
      { delete: marketplaceTopicPath(topicId) },
    ]);
  }

  async removeContentV2StorageItems(
    state: ContentV2PublishTargetState | undefined,
    control?: PublishJobControl,
  ): Promise<void> {
    const paths = Object.values(state?.items ?? {})
      .filter((item) => item.kind === "storage-object")
      .map((item) => item.path);
    for (const path of paths) {
      await control?.checkpoint();
      await this.auth.deleteStorageObject(path);
    }
  }

  async staleContentV2TopicQuizIds(
    topicId: string,
    localQuizIds: string[],
  ): Promise<string[]> {
    const remoteNames = await this.listDocumentNames(
      contentV2TopicPath(topicId),
      "quizzes",
    );
    return stalePublishedQuizIds(
      remoteNames.map((name) => decodeURIComponent(name.split("/").at(-1)!)),
      localQuizIds,
    );
  }

  async deleteContentV2TopicQuizzes(
    topicId: string,
    quizIds: string[],
    control?: PublishJobControl,
  ): Promise<void> {
    for (const [index, quizId] of quizIds.entries()) {
      await control?.checkpoint();
      const quizPath = contentV2QuizPath(topicId, quizId);
      const childNames = (
        await Promise.all([
          this.listDocumentNames(quizPath, "questions"),
          this.listDocumentNames(quizPath, "resources"),
          this.listDocumentNames(quizPath, "assets"),
        ])
      ).flat();
      const writes: Array<Record<string, unknown>> = [
        ...childNames.map((name) => ({ delete: name })),
        { delete: quizPath },
      ];
      for (let offset = 0; offset < writes.length; offset += 450) {
        await control?.checkpoint();
        await this.commit(writes.slice(offset, offset + 450));
      }
      await control?.advance(
        `Removed deleted quiz ${index + 1}/${quizIds.length} · ${quizId}`,
      );
    }
  }

  async publishContentV2Quiz(
    topicId: string,
    quiz: ContentV2Quiz,
    questions: ContentV2Question[],
    resources: Record<string, unknown>,
    assets: ContentV2Asset[],
    contentHash: string,
    previousState?: ContentV2PublishTargetState,
    control?: PublishJobControl,
    followingOperationCount = 0,
  ): Promise<ContentV2PublishResult & {
    environment: string;
    projectId: string;
    items: ContentV2PublishTargetState["items"];
    changedItemCount: number;
    removedItemCount: number;
  }> {
    await control?.checkpoint();
    const target = await this.auth.publishingTarget();
    if (marketplaceTopicState(quiz.marketplace) === "unlisted") {
      await control?.setTotal(1, "Removing quiz from the marketplace");
      await this.removeContentV2StorageItems(previousState, control);
      await this.deleteContentV2TopicQuizzes(topicId, [quiz.id], control);
      return { kind: "quiz", topicId, quizId: quiz.id, contentHash,
        publishedAt: new Date().toISOString(), environment: target.environment,
        projectId: target.projectId, items: {}, changedItemCount: 0,
        removedItemCount: Object.keys(previousState?.items ?? {}).length };
    }
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
    const questionWrites: Array<Record<string, unknown>> = preview.firestore.questionDocuments
      .filter((document) => diff.changed.has(publishedItemKey({ kind: "firestore-document", path: document.path })))
      .map((document) => ({
        update: {
          name: "",
          relativeName: document.path,
          fields: fields(document.data),
        },
      }),
    );
    const cleanupWrites: Array<Record<string, unknown>> = [];
    for (const name of remoteQuestionNames)
      if (!nextNames.has(name.split("/").at(-1)!))
        cleanupWrites.push({ delete: name });
    for (const name of remoteAssetNames) cleanupWrites.push({ delete: name });
    for (const name of remoteResourceNames)
      if (!nextResourceNames.has(decodeURIComponent(name.split("/").at(-1)!)))
        cleanupWrites.push({ delete: name });
    for (const item of diff.removed)
      if (item.kind === "firestore-document") cleanupWrites.push({ delete: item.path });
    const changedAssets = assets.filter((_, index) =>
      diff.changed.has(publishedItemKey({
        kind: "storage-object",
        path: preview.firebaseStorage.uploads[index].destinationPath,
      })),
    );
    const removedStorage = diff.removed.filter((item) => item.kind === "storage-object");
    const resourceWrites: Array<Record<string, unknown>> = preview.firestore.resourceDocuments
      .filter((document) => diff.changed.has(publishedItemKey({ kind: "firestore-document", path: document.path })))
      .map((document) => ({
        update: {
          name: "",
          relativeName: document.path,
          fields: fields(document.data),
        },
      }));
    const quizChanged = diff.changed.has(publishedItemKey({ kind: "firestore-document", path: quizPath }));
    const publishOperationCount = questionWrites.length + resourceWrites.length
      + changedAssets.length + removedStorage.length + cleanupWrites.length
      + (quizChanged ? 1 : 0) + 1 + followingOperationCount;
    await control?.setTotal(
      questions.length + publishOperationCount,
      `Publishing ${questionWrites.length}/${questions.length} changed questions · ${changedAssets.length} assets · ${resourceWrites.length} resources`,
    );
    let uploadedAssets = 0;
    for (let offset = 0; offset < changedAssets.length; offset += 8) {
      await Promise.all(
        changedAssets.slice(offset, offset + 8).map(async (asset) => {
          await control?.checkpoint();
          const previewAsset = preview.firebaseStorage.uploads.find((upload) => upload.reference === asset.reference)!;
          await this.auth.uploadStorageObject(
            previewAsset.destinationPath,
            asset.data,
            asset.mimeType,
          );
          uploadedAssets += 1;
          await control?.advance(`Uploading assets ${uploadedAssets}/${changedAssets.length}`);
        }),
      );
    }
    let removedAssetCount = 0;
    await Promise.all(removedStorage.map(async (item) => {
      await control?.checkpoint();
      await this.auth.deleteStorageObject(item.path);
      removedAssetCount += 1;
      await control?.advance(`Removing obsolete assets ${removedAssetCount}/${removedStorage.length}`);
    }));
    const commitGroup = async (writes: Array<Record<string, unknown>>, noun: string) => {
      for (let offset = 0; offset < writes.length; offset += 450) {
        const batch = writes.slice(offset, offset + 450);
      await control?.checkpoint();
        await this.commit(batch);
        await control?.advance(`Publishing ${noun} ${Math.min(offset + batch.length, writes.length)}/${writes.length}`, batch.length);
      }
    };
    await commitGroup(questionWrites, "questions");
    await commitGroup(resourceWrites, "resources");
    await commitGroup(cleanupWrites, "cleanup operations");
    const publishedAt = diff.changed.size || diff.removed.length
      ? new Date().toISOString()
      : previousState?.publishedAt ?? new Date().toISOString();
    if (quizChanged)
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
      await control?.advance("Published quiz document");
      }
    await control?.checkpoint();
    const verified = await this.getDocument(quizPath);
    if (stringField(verified.document, "contentHash") !== contentHash)
      throw new Error(
        "Firestore verification failed: the quiz hash does not match.",
      );
    await control?.advance("Verified published quiz");
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
