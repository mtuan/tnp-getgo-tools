import { useEffect, useState } from "react";
import type {
  AppSettings,
  ContentV2QuizPublishPreview,
  QuizSummary,
} from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { QuizCodeEditor } from "../../quiz-editor/components/QuizCodeEditor";
import { PreviewAsset } from "../../../shared/ui/QuestionPreview";
import { SummaryCard } from "../../../shared/ui/SummaryCard";
import { Panel } from "../../../shared/ui/Panel";
import { TreeView, type TreeViewItem } from "../../../shared/ui/TreeView";

type LocalPublishStatus =
  "local-error" | "not-published" | "changed" | "up-to-date";

interface Props {
  quiz: QuizSummary;
  locale: AppSettings["locale"];
}

function nestedPathTree(
  segments: string[],
  finalChildren: TreeViewItem[],
  prefix: string,
  mode: "firestore" | "storage",
  labels: { collection: string; document: string; folder: string },
  depth = 0,
): TreeViewItem[] {
  const [segment, ...remaining] = segments;
  if (!segment) return finalChildren;
  const id = `${prefix}/${segment}`;
  return [{
    id,
    label: decodeURIComponent(segment),
    kind: mode === "storage" ? "folder" : depth % 2 === 0 ? "collection" : "document",
    meta: mode === "storage" ? labels.folder : depth % 2 === 0 ? labels.collection : labels.document,
    children: nestedPathTree(remaining, finalChildren, id, mode, labels, depth + 1),
  }];
}

export function QuizPublishPanel({ quiz, locale }: Props) {
  const copy = (locale === "vi" ? vi : en).quizPublish;
  const isContentV2 = quiz.relativePath.startsWith("content-v2/");
  const [preview, setPreview] = useState<ContentV2QuizPublishPreview | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedFirestoreId, setSelectedFirestoreId] =
    useState<string | null>(null);
  const [selectedStorageId, setSelectedStorageId] = useState<string | null>(
    null,
  );
  useEffect(() => {
    if (!isContentV2) return;
    let active = true;
    setPreview(null);
    setPreviewError(null);
    void window.getgo
      .previewContentV2QuizPublish(quiz.contest, quiz.id)
      .then((result) => {
        if (!active) return;
        setPreview(result);
        setSelectedFirestoreId("firestore:quiz");
        setSelectedStorageId(
          result.firebaseStorage.uploads[0]
            ? `storage:${result.firebaseStorage.uploads[0].destinationPath}`
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (active)
          setPreviewError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      active = false;
    };
  }, [isContentV2, quiz.contest, quiz.id, quiz.localContentHash]);
  const publishPath = isContentV2
    ? `/getgo-content-v2/catalog/topics/${encodeURIComponent(quiz.contest)}/quizzes/${encodeURIComponent(quiz.id)}`
    : `/getgo-contests/${encodeURIComponent(quiz.contest)}/quizzes/${encodeURIComponent(quiz.id)}`;
  const publishStructure = isContentV2
    ? quiz.type !== "contest"
      ? `${publishPath}
  { schemaVersion, id, type: "alphabet", topicId, title,
    description, order, language, contentHash, publishedAt }

${publishPath}/questions/{questionId}
  { schemaVersion, id, type: "alphabet-letter", order,
    letter, uppercase, lowercase, pronunciation? }

${publishPath}/resources/{resourceId}
  { id, data }`
      : `${publishPath}
  { schemaVersion, id, type: "competition-paper", topicId, title,
    description, order, grade, round, year, contentHash, publishedAt }

${publishPath}/questions/{questionId}
  { schemaVersion, id, type: "competition-question", order,
    category?, text, assets, answer, explanation?, dynamic? }

${publishPath}/resources/{resourceId}
  { id, data }`
    : `${publishPath}
  { id, title, grade, round, year, questionStorage,
    questionCount, contentHash, publishedAt }

${publishPath}/questions/{questionNumber}
  { question runtime data }`;
  const status: LocalPublishStatus = !quiz.localContentHash
    ? "local-error"
    : !quiz.publishedHash
      ? "not-published"
      : quiz.localContentHash === quiz.publishedHash
        ? "up-to-date"
        : "changed";
  const statusLabels: Record<LocalPublishStatus, string> = {
    "local-error": copy.unavailable,
    "not-published": copy.notPublished,
    changed: copy.republishNeeded,
    "up-to-date": copy.published,
  };
  const lastPublished = quiz.publishedAt
    ? new Date(quiz.publishedAt).toLocaleString(locale)
    : copy.never;
  const firestoreDocuments = preview
    ? [
        { id: "firestore:quiz", label: copy.quizDocument, ...preview.firestore.quizDocument },
        ...preview.firestore.questionDocuments.map((document) => ({
          id: `firestore:${document.path}`,
          label: document.path.split("/").at(-1) ?? copy.questionDocument,
          ...document,
        })),
        ...preview.firestore.resourceDocuments.map((document) => ({
          id: `firestore:${document.path}`,
          label: document.path.split("/").at(-1) ?? copy.resourceDocument,
          ...document,
        })),
      ]
    : [];
  const selectedFirestoreDocument = firestoreDocuments.find(
    (document) => document.id === selectedFirestoreId,
  );
  const selectedStorageUpload = preview?.firebaseStorage.uploads.find(
    (upload) => `storage:${upload.destinationPath}` === selectedStorageId,
  );
  const firestoreTree = preview
    ? nestedPathTree(
        preview.firestore.quizDocument.path.split("/").filter(Boolean),
        [
          { id: "firestore:quiz", label: copy.quizDocument, kind: "document", meta: copy.documentType },
          {
            id: "firestore:questions",
            label: "questions",
            kind: "collection",
            meta: copy.collectionType,
            children: preview.firestore.questionDocuments.map((document) => ({
              id: `firestore:${document.path}`,
              label: decodeURIComponent(document.path.split("/").at(-1) ?? ""),
              kind: "document",
              meta: copy.documentType,
            })),
          },
          {
            id: "firestore:resources",
            label: "resources",
            kind: "collection",
            meta: copy.collectionType,
            children: preview.firestore.resourceDocuments.map((document) => ({
              id: `firestore:${document.path}`,
              label: decodeURIComponent(document.path.split("/").at(-1) ?? ""),
              kind: "document",
              meta: copy.documentType,
            })),
          },
        ],
        "firestore-tree",
        "firestore",
        { collection: copy.collectionType, document: copy.documentType, folder: copy.folderType },
      )
    : [];
  const storageTree = preview
    ? nestedPathTree(
        preview.firebaseStorage.uploads[0]?.destinationPath
          .split("/")
          .slice(0, -1) ?? [],
        preview.firebaseStorage.uploads.map((upload) => ({
          id: `storage:${upload.destinationPath}`,
          label: upload.destinationPath.split("/").at(-1) ?? upload.reference,
          kind: "file",
          meta: copy.fileType,
        })),
        "storage-tree",
        "storage",
        { collection: copy.collectionType, document: copy.documentType, folder: copy.folderType },
      )
    : [];

  return (
    <section className="quiz-publish-page">
      <header className="quiz-publish-heading">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <span className={`badge publishing-status publishing-status-${status}`}>
          {statusLabels[status]}
        </span>
      </header>
      <div className="quiz-publish-summary">
        <SummaryCard
          label={copy.status}
          value={statusLabels[status]}
          detail={
            status === "changed"
              ? copy.changedDescription
              : status === "up-to-date"
                ? copy.currentDescription
                : undefined
          }
        />
        <SummaryCard label={copy.lastPublished} value={lastPublished} />
        <SummaryCard label={copy.questions} value={quiz.questionCount ?? "—"} />
      </div>
      <dl className="quiz-publish-details">
        <div className="quiz-publish-path">
          <dt>{copy.publishPath}</dt>
          <dd>
            <code>{publishPath}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.publishedHash}</dt>
          <dd>
            <code>{quiz.publishedHash || copy.none}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.currentHash}</dt>
          <dd>
            <code>{quiz.localContentHash || copy.unavailable}</code>
          </dd>
        </div>
      </dl>
      <section className="quiz-publish-structure">
        <h3>{copy.publishStructure}</h3>
        <p>
          {isContentV2
            ? copy.publishDataDescription
            : copy.publishStructureDescription}
        </p>
        {isContentV2 ? (
          previewError ? (
            <div className="error-banner">{previewError}</div>
          ) : preview ? (
            <div className="quiz-publish-targets">
              <Panel
                className="quiz-publish-target-panel"
                title={copy.firestorePanel}
                description={copy.firestorePanelDescription}
              >
                <div className="quiz-publish-browser">
                  <TreeView
                    ariaLabel={copy.firestoreTree}
                    items={firestoreTree}
                    selectedId={selectedFirestoreId}
                    onSelect={setSelectedFirestoreId}
                  />
                  <div className="quiz-publish-browser-detail">
                    {selectedFirestoreDocument && (
                      <>
                        <header>
                          <strong>{selectedFirestoreDocument.label}</strong>
                          <code>{selectedFirestoreDocument.path}</code>
                        </header>
                        <div className="quiz-publish-item-editor">
                          <QuizCodeEditor
                            value={JSON.stringify(selectedFirestoreDocument.data, null, 2)}
                            path={`publish-preview/${quiz.id}-${selectedFirestoreDocument.id.replaceAll(/[^a-z0-9]+/gi, "-")}.json`}
                            language="json"
                            readOnly
                            onChange={() => undefined}
                            onSave={() => undefined}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Panel>
              <Panel
                className="quiz-publish-target-panel"
                title={copy.cloudStoragePanel}
                description={copy.cloudStoragePanelDescription}
              >
                <div className="quiz-publish-browser">
                  <TreeView
                    ariaLabel={copy.cloudStorageTree}
                    items={storageTree}
                    selectedId={selectedStorageId}
                    onSelect={setSelectedStorageId}
                  />
                  <div className="quiz-publish-browser-detail">
                    {selectedStorageUpload ? (
                      <>
                        <header>
                          <strong>{selectedStorageUpload.reference}</strong>
                          <code>{selectedStorageUpload.destinationPath}</code>
                        </header>
                        <div className="quiz-publish-asset-preview">
                          <PreviewAsset
                            manifestPath={quiz.manifestPath}
                            value={selectedStorageUpload.reference}
                            alt={selectedStorageUpload.reference.slice("asset:".length)}
                          />
                        </div>
                        <dl className="quiz-publish-upload-details">
                          <div><dt>{copy.localSourcePath}</dt><dd><code>{selectedStorageUpload.localSourcePath}</code></dd></div>
                          <div><dt>{copy.storageDestination}</dt><dd><code>{selectedStorageUpload.destinationPath}</code></dd></div>
                          <div><dt>{copy.mimeType}</dt><dd><code>{selectedStorageUpload.mimeType}</code></dd></div>
                          <div><dt>{copy.contentHash}</dt><dd><code>{selectedStorageUpload.contentHash}</code></dd></div>
                        </dl>
                      </>
                    ) : (
                      <span className="quiz-publish-empty-detail">{copy.noStorageFiles}</span>
                    )}
                  </div>
                </div>
              </Panel>
            </div>
          ) : (
            <div className="quiz-publish-preview-loading">
              {copy.loadingPublishData}
            </div>
          )
        ) : (
          <pre><code>{publishStructure}</code></pre>
        )}
      </section>
    </section>
  );
}
