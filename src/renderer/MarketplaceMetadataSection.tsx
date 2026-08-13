import { useEffect, useMemo, useState, type FormEvent } from "react";
import { RotateCcw, Save } from "lucide-react";
import type {
  ContentV2Quiz,
  ContentV2Topic,
  MarketplaceTopicMetadata,
} from "../core/content-v2";
import type { AppSettings } from "../core/models";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import {
  Button,
  Form,
  Panel,
  useToast,
  type FormSchema,
  type FormValues,
} from "./ui";

type MarketplaceRecord = ContentV2Topic | ContentV2Quiz;

const toLines = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").join("\n")
    : "";
const toList = (value: unknown) =>
  String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

function metadata(record: MarketplaceRecord): MarketplaceTopicMetadata {
  const topic = record as ContentV2Topic;
  return {
    listed: record.marketplace?.listed === true,
    shortDescription:
      record.marketplace?.shortDescription ?? record.description,
    fullDescription:
      record.marketplace?.fullDescription ?? record.description,
    featured: record.marketplace?.featured === true,
    subjects:
      record.marketplace?.subjects ??
      (topic.type === "competition" ? [topic.subject] : []),
    languages:
      record.marketplace?.languages ??
      (topic.type === "kid-learning" ? topic.supportedLanguages : []),
    tags: record.marketplace?.tags ?? [],
    learningObjectives: record.marketplace?.learningObjectives ?? [],
    ageRange:
      record.marketplace?.ageRange ??
      (topic.type === "kid-learning" ? topic.recommendedAgeRange : undefined),
    pricing: record.marketplace?.pricing ?? {
      type: "free",
      currency: "VND",
    },
    ...(record.marketplace?.publishedHash
      ? { publishedHash: record.marketplace.publishedHash }
      : {}),
    ...(record.marketplace?.publishedAt
      ? { publishedAt: record.marketplace.publishedAt }
      : {}),
  };
}

export function MarketplaceMetadataSection({
  locale,
  load,
  save,
}: {
  locale: AppSettings["locale"];
  load(): Promise<MarketplaceRecord>;
  save(record: MarketplaceRecord): Promise<void>;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const toast = useToast();
  const [source, setSource] = useState<MarketplaceRecord | null>(null);
  const [draft, setDraft] = useState<MarketplaceRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = Boolean(
    source && draft && JSON.stringify(source) !== JSON.stringify(draft),
  );

  useEffect(() => {
    let active = true;
    setBusy(true);
    void load()
      .then((record) => {
        if (!active) return;
        setSource(record);
        setDraft(structuredClone(record));
      })
      .catch((error) => {
        if (active)
          toast.show({
            title: copy.loadFailed,
            description: String(error),
            variant: "error",
          });
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [copy.loadFailed, load, toast]);

  const current = draft ? metadata(draft) : null;
  const values: FormValues = current
    ? {
        shortDescription: current.shortDescription,
        fullDescription: current.fullDescription,
        featured: current.featured,
        subjects: toLines(current.subjects),
        languages: current.languages,
        tags: toLines(current.tags),
        learningObjectives: toLines(current.learningObjectives),
        minimumAge: current.ageRange?.minimum,
        maximumAge: current.ageRange?.maximum,
        pricingType: current.pricing.type,
        amount: current.pricing.amount,
        currency: current.pricing.currency,
      }
    : {};
  const fields = useMemo<FormSchema[]>(
    () => [
      {
        section: copy.sections.identity,
        fields: [
          {
            type: "textarea",
            name: "shortDescription",
            label: copy.fields.shortDescription,
            required: true,
            maxLines: 3,
          },
          {
            type: "textarea",
            name: "fullDescription",
            label: copy.fields.fullDescription,
            required: true,
            maxLines: 6,
          },
          {
            type: "toggle",
            name: "featured",
            label: copy.fields.featured,
            presentation: "row",
          },
        ],
      },
      {
        section: copy.sections.discovery,
        fields: [
          [
            {
              type: "textarea",
              name: "subjects",
              label: copy.fields.subjects,
              maxLines: 3,
            },
            {
              type: "multi-select",
              name: "languages",
              label: copy.fields.languages,
              options: [
                { value: "en", label: "English" },
                { value: "vi", label: "Tiếng Việt" },
              ],
            },
          ],
          [
            {
              type: "textarea",
              name: "tags",
              label: copy.fields.tags,
              maxLines: 3,
            },
            {
              type: "textarea",
              name: "learningObjectives",
              label: copy.fields.learningObjectives,
              maxLines: 3,
            },
          ],
          [
            {
              type: "number",
              name: "minimumAge",
              label: copy.fields.minimumAge,
              min: 1,
            },
            {
              type: "number",
              name: "maximumAge",
              label: copy.fields.maximumAge,
              min: 1,
            },
          ],
        ],
      },
      {
        section: copy.sections.pricing,
        fields: [
          [
            {
              type: "select",
              name: "pricingType",
              label: copy.fields.pricingType,
              options: [
                { value: "free", label: copy.free },
                { value: "paid", label: copy.paid },
              ],
            },
            {
              type: "number",
              name: "amount",
              label: copy.fields.amount,
              min: 0,
              when: (form) => form.pricingType === "paid",
            },
            {
              type: "text",
              name: "currency",
              label: copy.fields.currency,
              when: (form) => form.pricingType === "paid",
            },
          ],
        ],
      },
    ],
    [copy],
  );
  const change = (name: string, value: unknown) =>
    setDraft((record) => {
      if (!record) return record;
      const next = metadata(record) as MarketplaceTopicMetadata &
        Record<string, unknown>;
      if (["subjects", "tags", "learningObjectives"].includes(name))
        next[name] = toList(value);
      else if (name === "languages")
        next.languages = Array.isArray(value) ? value.map(String) : [];
      else if (name === "minimumAge" || name === "maximumAge")
        next.ageRange = {
          ...next.ageRange,
          [name === "minimumAge" ? "minimum" : "maximum"]: value as
            | number
            | undefined,
        };
      else if (["pricingType", "amount", "currency"].includes(name))
        next.pricing = {
          ...next.pricing,
          [name === "pricingType" ? "type" : name]: value,
        } as MarketplaceTopicMetadata["pricing"];
      else next[name] = value;
      return { ...record, marketplace: next } as MarketplaceRecord;
    });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !dirty) return;
    setBusy(true);
    try {
      await save(draft);
      setSource(structuredClone(draft));
      toast.show({ title: copy.saved, variant: "success" });
    } catch (error) {
      toast.show({
        title: copy.saveFailed,
        description: String(error),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={copy.tab}
      description={copy.topicDescription}
      meta={
        <div className="panel-heading-actions">
          <Button
            color="neutral"
            icon={<RotateCcw />}
            disabled={!dirty || busy}
            onClick={() => source && setDraft(structuredClone(source))}
          >
            {copy.cancel}
          </Button>
          <Button
            icon={<Save />}
            disabled={!dirty || busy}
            loading={busy}
            type="submit"
            form="marketplace-metadata-form"
          >
            {copy.save}
          </Button>
        </div>
      }
    >
      {draft ? (
        <form id="marketplace-metadata-form" onSubmit={(event) => void submit(event)}>
          <Form fields={fields} values={values} onChange={change} />
        </form>
      ) : (
        <div className="ui-panel-loading"><span className="mini-spinner" /></div>
      )}
    </Panel>
  );
}
