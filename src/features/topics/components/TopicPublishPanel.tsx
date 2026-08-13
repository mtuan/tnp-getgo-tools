import { useEffect, useState } from "react";
import type { AppSettings, ContentV2TopicPublishPreview, ContentV2TopicSummary } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import { QuizCodeEditor } from "../../quiz-editor/components/QuizCodeEditor";
import { Panel } from "../../../shared/ui/Panel";
import { SummaryCard } from "../../../shared/ui/SummaryCard";
import { TreeView, type TreeViewItem } from "../../../shared/ui/TreeView";

function firestoreTree(path: string, topicId: string, labels: { collection: string; document: string }): TreeViewItem[] {
  const segments = path.split("/").filter(Boolean);
  const build = (index: number, prefix: string): TreeViewItem[] => {
    const segment = segments[index];
    if (!segment) return [];
    const id = `${prefix}/${segment}`;
    const final = index === segments.length - 1;
    return [{
      id: final ? "firestore:topic" : id,
      label: decodeURIComponent(segment),
      kind: index % 2 === 0 ? "collection" : "document",
      meta: index % 2 === 0 ? labels.collection : labels.document,
      children: final ? undefined : build(index + 1, id),
    }];
  };
  return build(0, `topic-${topicId}`);
}

export function TopicPublishPanel({ topic, locale }: { topic: ContentV2TopicSummary; locale: AppSettings["locale"] }) {
  const copy = (locale === "vi" ? vi : en).topicPublish;
  const quizCopy = (locale === "vi" ? vi : en).quizPublish;
  const [preview, setPreview] = useState<ContentV2TopicPublishPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    void window.getgo.previewContentV2TopicPublish(topic.id)
      .then((result) => { if (active) setPreview(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { active = false; };
  }, [topic.id, topic.localHash]);
  const status = !topic.publishedHash ? copy.notPublished : topic.publishedHash === topic.localHash ? copy.upToDate : copy.changed;
  const path = preview?.firestore.topicDocument.path ?? `/getgo-content-v2/catalog/topics/${topic.id}`;
  return <section className="quiz-publish-page">
    <header className="quiz-publish-heading">
      <div><h2>{copy.title}</h2><p>{copy.description}</p></div>
      <span className={`badge publishing-status publishing-status-${topic.publishedHash === topic.localHash ? "up-to-date" : "changed"}`}>{status}</span>
    </header>
    <div className="quiz-publish-summary">
      <SummaryCard label={quizCopy.status} value={status} />
      <SummaryCard label={copy.lastPublished} value={topic.publishedAt ? new Date(topic.publishedAt).toLocaleString(locale) : copy.never} />
      <SummaryCard label={copy.quizzes} value={topic.quizCount} detail={copy.quizIdsDetail} />
    </div>
    <dl className="quiz-publish-details">
      <div className="quiz-publish-path"><dt>{copy.firestorePath}</dt><dd><code>{path}</code></dd></div>
      <div><dt>{copy.publishedHash}</dt><dd><code>{topic.publishedHash ?? copy.none}</code></dd></div>
      <div><dt>{copy.localHash}</dt><dd><code>{topic.localHash}</code></dd></div>
    </dl>
    <section className="quiz-publish-structure">
      <h3>{quizCopy.publishStructure}</h3>
      <p>{quizCopy.publishDataDescription}</p>
      {error ? <div className="error-banner">{error}</div> : preview ? (
        <div className="quiz-publish-targets">
          <Panel className="quiz-publish-target-panel" title={quizCopy.firestorePanel} description={quizCopy.firestorePanelDescription}>
            <div className="quiz-publish-browser">
              <TreeView ariaLabel={quizCopy.firestoreTree} items={firestoreTree(path, topic.id, { collection: quizCopy.collectionType, document: quizCopy.documentType })} selectedId="firestore:topic" onSelect={() => undefined} />
              <div className="quiz-publish-browser-detail">
                <header><strong>{copy.topicDocument}</strong><code>{path}</code></header>
                <div className="quiz-publish-item-editor"><QuizCodeEditor value={JSON.stringify(preview.firestore.topicDocument.data, null, 2)} path={`publish-preview/${topic.id}-topic.json`} language="json" readOnly onChange={() => undefined} onSave={() => undefined} /></div>
              </div>
            </div>
          </Panel>
          <Panel className="quiz-publish-target-panel" title={quizCopy.cloudStoragePanel} description={quizCopy.cloudStoragePanelDescription}>
            <div className="quiz-publish-browser">
              <TreeView ariaLabel={quizCopy.cloudStorageTree} items={[]} selectedId={null} onSelect={() => undefined} />
              <div className="quiz-publish-browser-detail"><span className="quiz-publish-empty-detail">{quizCopy.noStorageFiles}</span></div>
            </div>
          </Panel>
        </div>
      ) : <div className="quiz-publish-preview-loading">{quizCopy.loadingPublishData}</div>}
    </section>
  </section>;
}
