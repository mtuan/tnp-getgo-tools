import { useMemo, useState, type FormEvent } from "react";
import { EyeOff, Pencil, UploadCloud } from "lucide-react";
import type { ContentV2Topic, MarketplaceTopicMetadata } from "../core/content-v2";
import type { AppSettings, ContentV2TopicSummary, RepositorySnapshot } from "../core/models";
import type { QuizManagerApi } from "./QuizManager";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { Button, DialogFrame, Form, Panel, SummaryCard, useToast, type FormSchema, type FormValues } from "./ui";

const toLines = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
const toList = (value: unknown) => String(value ?? "").split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

function metadata(topic: ContentV2Topic): MarketplaceTopicMetadata {
  return {
    listed: topic.marketplace?.listed === true,
    shortDescription: topic.marketplace?.shortDescription ?? topic.description,
    fullDescription: topic.marketplace?.fullDescription ?? topic.description,
    featured: topic.marketplace?.featured === true,
    subjects: topic.marketplace?.subjects ?? (topic.type === "competition" ? [topic.subject] : []),
    languages: topic.marketplace?.languages ?? (topic.type === "kid-learning" ? topic.supportedLanguages : []),
    tags: topic.marketplace?.tags ?? [],
    learningObjectives: topic.marketplace?.learningObjectives ?? [],
    ageRange: topic.marketplace?.ageRange ?? (topic.type === "kid-learning" ? topic.recommendedAgeRange : undefined),
    pricing: topic.marketplace?.pricing ?? { type: "free", currency: "VND" },
    ...(topic.marketplace?.publishedHash ? { publishedHash: topic.marketplace.publishedHash } : {}),
    ...(topic.marketplace?.publishedAt ? { publishedAt: topic.marketplace.publishedAt } : {}),
  };
}

export function TopicMarketplacePanel({ topic, locale, api, onSnapshotChange, onOpenJobs }: {
  topic: ContentV2TopicSummary;
  locale: AppSettings["locale"];
  api: QuizManagerApi;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onOpenJobs(): void;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const toast = useToast();
  const [source, setSource] = useState<ContentV2Topic | null>(null);
  const [draft, setDraft] = useState<ContentV2Topic | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const current = draft ? metadata(draft) : null;
  const dirty = Boolean(source && draft && JSON.stringify(source) !== JSON.stringify(draft));
  const status = !topic.marketplacePublishedHash ? copy.notPublished : topic.marketplacePublishedHash === topic.marketplaceLocalHash ? copy.upToDate : copy.changed;
  const open = async () => {
    setBusy(true);
    try {
      const loaded = await api.loadContentV2Topic(topic.id);
      setSource(loaded);
      setDraft(structuredClone(loaded));
    } catch (error) { toast.show({ title: copy.loadFailed, description: String(error), variant: "error" }); }
    finally { setBusy(false); }
  };
  const values: FormValues = current ? {
    shortDescription: current.shortDescription, fullDescription: current.fullDescription, featured: current.featured,
    subjects: toLines(current.subjects), languages: current.languages, tags: toLines(current.tags),
    learningObjectives: toLines(current.learningObjectives), minimumAge: current.ageRange?.minimum,
    maximumAge: current.ageRange?.maximum, pricingType: current.pricing.type, amount: current.pricing.amount, currency: current.pricing.currency,
  } : {};
  const fields = useMemo<FormSchema[]>(() => [
    { section: copy.sections.identity, fields: [
      { type: "textarea", name: "shortDescription", label: copy.fields.shortDescription, required: true, maxLines: 3 },
      { type: "textarea", name: "fullDescription", label: copy.fields.fullDescription, required: true, maxLines: 6 },
      { type: "toggle", name: "featured", label: copy.fields.featured, presentation: "row" },
    ] },
    { section: copy.sections.discovery, fields: [
      [{ type: "textarea", name: "subjects", label: copy.fields.subjects, maxLines: 3 }, { type: "multi-select", name: "languages", label: copy.fields.languages, options: [{ value: "en", label: "English" }, { value: "vi", label: "Tiếng Việt" }] }],
      [{ type: "textarea", name: "tags", label: copy.fields.tags, maxLines: 3 }, { type: "textarea", name: "learningObjectives", label: copy.fields.learningObjectives, maxLines: 3 }],
      [{ type: "number", name: "minimumAge", label: copy.fields.minimumAge, min: 1 }, { type: "number", name: "maximumAge", label: copy.fields.maximumAge, min: 1 }],
    ] },
    { section: copy.sections.pricing, fields: [[
      { type: "select", name: "pricingType", label: copy.fields.pricingType, options: [{ value: "free", label: copy.free }, { value: "paid", label: copy.paid }] },
      { type: "number", name: "amount", label: copy.fields.amount, min: 0, when: (form) => form.pricingType === "paid" },
      { type: "text", name: "currency", label: copy.fields.currency, when: (form) => form.pricingType === "paid" },
    ]] },
  ], [copy]);
  const change = (name: string, value: unknown) => setDraft((record) => {
    if (!record) return record;
    const next = metadata(record) as MarketplaceTopicMetadata & Record<string, unknown>;
    if (["subjects", "tags", "learningObjectives"].includes(name)) next[name] = toList(value);
    else if (name === "languages") next.languages = Array.isArray(value) ? value.map(String) : [];
    else if (name === "minimumAge" || name === "maximumAge") next.ageRange = { ...next.ageRange, [name === "minimumAge" ? "minimum" : "maximum"]: value as number | undefined };
    else if (["pricingType", "amount", "currency"].includes(name)) next.pricing = { ...next.pricing, [name === "pricingType" ? "type" : name]: value } as MarketplaceTopicMetadata["pricing"];
    else next[name] = value;
    return { ...record, marketplace: next } as ContentV2Topic;
  });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft || !dirty) return; setBusy(true);
    try { const snapshot = await api.saveContentV2Topic(draft); onSnapshotChange(snapshot); setSource(null); setDraft(null); toast.show({ title: copy.saved, variant: "success" }); }
    catch (error) { toast.show({ title: copy.saveFailed, description: String(error), variant: "error" }); }
    finally { setBusy(false); }
  };
  const publish = async (listed: boolean) => {
    setBusy(true);
    try {
      const result = listed
        ? await api.publishContentV2Topic(topic.id)
        : await api.publishMarketplaceTopic(topic.id, false);
      if ("snapshot" in result && result.snapshot) onSnapshotChange(result.snapshot);
      setConfirmingRemove(false); setSource(null); setDraft(null);
      if (listed) onOpenJobs();
      toast.show({ title: listed ? "Publish to Market started" : copy.removed, variant: "success", action: { label: copy.viewJob, onSelect: onOpenJobs } });
    }
    catch (error) { toast.show({ title: copy.publishFailed, description: String(error), variant: "error" }); }
    finally { setBusy(false); }
  };
  return <>
    <Panel title={copy.tab} description={copy.topicDescription} meta={<div className="panel-heading-actions"><Button icon={<Pencil />} onClick={() => void open()}>{copy.editMetadata}</Button><Button color="success" icon={<UploadCloud />} disabled={busy || dirty} loading={busy} onClick={() => void publish(true)}>Publish to Market</Button>{topic.marketplacePublishedHash && <Button color="danger" icon={<EyeOff />} disabled={busy} onClick={() => setConfirmingRemove(true)}>{copy.remove}</Button>}</div>}>
      <div className="quiz-publish-summary"><SummaryCard label={copy.columns.listing} value={topic.marketplacePublishedHash ? copy.listed : copy.unlisted} /><SummaryCard label={copy.publishStatus} value={status} /><SummaryCard label={copy.lastPublished} value={topic.marketplacePublishedAt ? new Date(topic.marketplacePublishedAt).toLocaleString(locale) : copy.never} /></div>
      <dl className="quiz-publish-details"><div><dt>{copy.localHash}</dt><dd><code>{topic.marketplaceLocalHash ?? copy.none}</code></dd></div><div><dt>{copy.publishedHash}</dt><dd><code>{topic.marketplacePublishedHash ?? copy.none}</code></dd></div></dl>
    </Panel>
    {draft && source && current && <DialogFrame title={copy.editMetadata} busy={busy} error={null} saveShortcut submitLabel={copy.save} submitDisabled={!dirty} cancelLabel={copy.cancel} onClose={() => { if (!busy) { setSource(null); setDraft(null); } }} onReset={() => setDraft(structuredClone(source))} onSubmit={(event) => void save(event)}><Form fields={fields} values={values} onChange={change} /></DialogFrame>}
    {confirmingRemove && <DialogFrame presentation="modal" title={copy.removeConfirmTitle} busy={busy} error={null} submitLabel={copy.remove} submitColor="danger" cancelLabel={copy.cancel} onClose={() => { if (!busy) setConfirmingRemove(false); }} onSubmit={(event) => { event.preventDefault(); void publish(false); }}><p>{copy.removeConfirm}</p></DialogFrame>}
  </>;
}
