import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { ContentV2Topic, MarketplaceTopicMetadata } from "../domain/content-v2";
import type { AppSettings } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import {
  Button,
  EditTable,
  Form,
  Panel,
  PanelBody,
  useToast,
  type EditColumnDef,
  type FormSchema,
} from "../../../shared/ui";
import { useSaveShortcut } from "../../../shared/ui/useSaveShortcut";

export type TopicDemoReview = {
  id: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
  source: "demo";
};

type MarketplaceWithDemoReviews = MarketplaceTopicMetadata & {
  demoReviews?: TopicDemoReview[];
};

function reviewsFrom(topic: ContentV2Topic): TopicDemoReview[] {
  return structuredClone((topic.marketplace as MarketplaceWithDemoReviews | undefined)?.demoReviews ?? []);
}

export function TopicDemoReviewsEditor({
  topicId,
  locale,
  load,
  save,
}: {
  topicId: string;
  locale: AppSettings["locale"];
  load(): Promise<ContentV2Topic>;
  save(topic: ContentV2Topic): Promise<void>;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const toast = useToast();
  const loadRef = useRef(load);
  loadRef.current = load;
  const [topic, setTopic] = useState<ContentV2Topic>();
  const [source, setSource] = useState<TopicDemoReview[]>([]);
  const [reviews, setReviews] = useState<TopicDemoReview[]>([]);
  const [busy, setBusy] = useState(true);
  const dirty = JSON.stringify(source) !== JSON.stringify(reviews);
  const average = reviews.length
    ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
    : 0;

  useEffect(() => {
    let active = true;
    setBusy(true);
    void loadRef.current().then((record) => {
      if (!active) return;
      const loadedReviews = reviewsFrom(record);
      setTopic(record);
      setSource(loadedReviews);
      setReviews(structuredClone(loadedReviews));
    }).catch((error) => {
      if (active) toast.show({ title: copy.loadFailed, description: String(error), variant: "error" });
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; };
  }, [copy.loadFailed, toast, topicId]);

  const columns = useMemo<EditColumnDef<TopicDemoReview>[]>(() => [
    { key: "authorName", dataKey: "authorName", title: copy.demoReviews.author, field: { type: "text", name: "authorName", required: true, disabled: busy } },
    { key: "rating", dataKey: "rating", title: copy.demoReviews.rating, width: 110, field: { type: "number", name: "rating", min: 1, max: 5, required: true, disabled: busy } },
    { key: "comment", dataKey: "comment", title: copy.demoReviews.comment, field: { type: "text", name: "comment", disabled: busy } },
  ], [busy, copy.demoReviews]);
  const fields = useMemo<FormSchema[]>(() => [{
    type: "custom",
    name: "demoReviews",
    disabled: busy,
    render: ({ value, disabled, onChange }) => {
      const rows = Array.isArray(value) ? value as TopicDemoReview[] : [];
      return <EditTable
        ariaLabel={copy.demoReviews.title}
        columns={columns}
        rows={rows}
        rowKey="id"
        onRowChange={(index, field, value) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: field === "rating" ? Number(value) : String(value) } : row))}
        onRowAdd={disabled ? undefined : () => onChange([...rows, { id: `demo-${Date.now()}`, authorName: "", rating: 5, comment: "", createdAt: new Date().toISOString(), source: "demo" }])}
        onRowDelete={disabled ? undefined : index => onChange(rows.filter((_row, rowIndex) => rowIndex !== index))}
        addLabel={copy.demoReviews.add}
        emptyText={copy.demoReviews.empty}
      />;
    },
  }], [busy, columns, copy.demoReviews]);

  const saveDraft = async () => {
    if (!topic || !dirty || busy) return;
    if (reviews.some(review => !review.authorName.trim() || !Number.isInteger(review.rating) || review.rating < 1 || review.rating > 5)) {
      toast.show({ title: copy.demoReviews.invalid, variant: "error" });
      return;
    }
    const nextTopic: ContentV2Topic = {
      ...topic,
      marketplace: { ...topic.marketplace, demoReviews: reviews } as MarketplaceWithDemoReviews,
    };
    setBusy(true);
    try {
      await save(nextTopic);
      const canonical = reviewsFrom(nextTopic);
      setTopic(nextTopic);
      setSource(canonical);
      setReviews(structuredClone(canonical));
      toast.show({ title: copy.saved, variant: "success" });
    } catch (error) {
      toast.show({ title: copy.saveFailed, description: String(error), variant: "error" });
    } finally {
      setBusy(false);
    }
  };
  useSaveShortcut({ enabled: dirty && !busy, onSave: () => void saveDraft() });

  return <Panel
    title={copy.demoReviews.title}
    description={`${copy.demoReviews.description} · ${copy.demoReviews.summary.replace("{count}", String(reviews.length)).replace("{average}", average.toFixed(1))}`}
    meta={<div className="ui-panel-actions">
      <Button color="neutral" icon={<RotateCcw />} disabled={!dirty || busy} onClick={() => setReviews(structuredClone(source))}>{copy.discard}</Button>
      <Button variant="solid" color="primary" icon={<Save />} loading={busy} disabled={!dirty || busy} onClick={() => void saveDraft()}>{copy.save}</Button>
    </div>}
  >
    <PanelBody>
      {topic ? <Form fields={fields} values={{ demoReviews: reviews }} onChange={(_name, value) => setReviews(Array.isArray(value) ? value as TopicDemoReview[] : [])} /> : <div className="ui-panel-loading"><span className="mini-spinner" /></div>}
    </PanelBody>
  </Panel>;
}
