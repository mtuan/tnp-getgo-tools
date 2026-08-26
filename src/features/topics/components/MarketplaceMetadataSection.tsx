import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { RotateCcw, Save } from "lucide-react";
import type {
  ContentV2Quiz,
  ContentV2Topic,
  MarketplaceTopicMetadata,
} from "../../../features/topics/domain/content-v2";
import type { AppSettings } from "../../../shared/domain/models";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";
import {
  Button,
  Form,
  AccordionSection,
  useToast,
  type FormSchema,
  type FormValues,
} from "../../../shared/ui";
import { useSaveShortcut } from "../../../shared/ui/useSaveShortcut";

type MarketplaceRecord = ContentV2Topic | ContentV2Quiz;

const standardSubjects = [
  { value: "mathematics", label: "Mathematics" },
  { value: "english", label: "English" },
  { value: "vietnamese", label: "Vietnamese" },
  { value: "physics", label: "Physics" },
  { value: "chemistry", label: "Chemistry" },
  { value: "biology", label: "Biology" },
  { value: "history", label: "History" },
  { value: "geography", label: "Geography" },
];

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
    ...(record.marketplace?.pricing
      ? { pricing: record.marketplace.pricing }
      : { pricing: { type: "free", currency: "VND" } }),
    ...(record.marketplace?.publishedHash
      ? { publishedHash: record.marketplace.publishedHash }
      : {}),
    ...(record.marketplace?.publishedAt
      ? { publishedAt: record.marketplace.publishedAt }
      : {}),
  };
}

export function MarketplaceMetadataSection({
  recordKey,
  locale,
  load,
  loadSubjectOptions,
  save,
}: {
  recordKey: string;
  locale: AppSettings["locale"];
  load(): Promise<MarketplaceRecord>;
  loadSubjectOptions?(): Promise<string[]>;
  save(record: MarketplaceRecord): Promise<void>;
}) {
  const copy = (locale === "vi" ? vi : en).marketplaceManager;
  const formId = `marketplace-metadata-${useId().replace(/:/g, "")}`;
  const toast = useToast();
  const [source, setSource] = useState<MarketplaceRecord | null>(null);
  const [draft, setDraft] = useState<MarketplaceRecord | null>(null);
  const [parentSubjects, setParentSubjects] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const loadRef = useRef(load);
  const loadSubjectOptionsRef = useRef(loadSubjectOptions);
  loadRef.current = load;
  loadSubjectOptionsRef.current = loadSubjectOptions;
  const dirty = Boolean(
    source && draft && JSON.stringify(source) !== JSON.stringify(draft),
  );

  useEffect(() => {
    let active = true;
    setBusy(true);
    void Promise.all([
      loadRef.current(),
      loadSubjectOptionsRef.current?.() ?? Promise.resolve([]),
    ])
      .then(([record, subjects]) => {
        if (!active) return;
        setSource(record);
        setDraft(structuredClone(record));
        setParentSubjects(subjects);
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
  // Like the general-information editor, keep the local draft intact until the
  // user saves, discards, or navigates to a different record.
  }, [recordKey]);
  const current = draft ? metadata(draft) : null;
  const isTopic = Boolean(draft && !("topicId" in draft));
  const subjectOptions = useMemo(() => {
    if (!isTopic)
      return parentSubjects.map((subject) => ({
        value: subject,
        label: standardSubjects.find((option) => option.value === subject)?.label ?? subject,
      }));
    const options = new Map(standardSubjects.map((subject) => [subject.value, subject]));
    for (const subject of source ? metadata(source).subjects : [])
      if (!options.has(subject)) options.set(subject, { value: subject, label: subject });
    return [...options.values()];
  }, [isTopic, parentSubjects, source]);
  const values: FormValues = current
    ? {
        shortDescription: current.shortDescription,
        fullDescription: current.fullDescription,
        subjects: isTopic ? current.subjects : current.subjects[0] ?? "",
        languages: current.languages,
        tags: toLines(current.tags),
        learningObjectives: toLines(current.learningObjectives),
        minimumAge: current.ageRange?.minimum,
        maximumAge: current.ageRange?.maximum,
        pricingType: !isTopic && !draft?.marketplace?.pricing
          ? "inherit"
          : current.pricing.type,
        amount: current.pricing.amount,
        currency: current.pricing.currency,
      }
    : {};
  const fields = useMemo<FormSchema[]>(
    () => [
      {
        type: "textarea",
        name: "shortDescription",
        label: copy.fields.shortDescription,
        required: true,
      },
      {
        type: "textarea",
        name: "fullDescription",
        label: copy.fields.fullDescription,
        required: true,
      },
      [
        isTopic
          ? {
              type: "multi-select",
              name: "subjects",
              label: copy.fields.subjects,
              options: subjectOptions,
            }
          : {
              type: "select",
              name: "subjects",
              label: copy.fields.subjects,
              options: subjectOptions,
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
          helper: copy.fields.listHelp,
        },
        {
          type: "textarea",
          name: "learningObjectives",
          label: copy.fields.learningObjectives,
          helper: copy.fields.listHelp,
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
      [
        {
          type: "select",
          name: "pricingType",
          label: copy.fields.pricingType,
          options: [
            ...(!isTopic ? [{ value: "inherit", label: copy.inherit }] : []),
            { value: "free", label: copy.free },
            { value: "subscription", label: copy.subscription },
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
    [copy, isTopic, subjectOptions],
  );
  const change = (name: string, value: unknown) =>
    setDraft((record) => {
      if (!record) return record;
      const next = metadata(record) as MarketplaceTopicMetadata &
        Record<string, unknown>;
      if (name === "subjects" && Array.isArray(value))
        next.subjects = value.map(String);
      else if (name === "subjects")
        next.subjects = value ? [String(value)] : [];
      else if (["subjects", "tags", "learningObjectives"].includes(name))
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
      else if (name === "pricingType" && value === "inherit")
        delete (next as Partial<MarketplaceTopicMetadata>).pricing;
      else if (["pricingType", "amount", "currency"].includes(name))
        next.pricing = {
          ...(next.pricing ?? { type: "free", currency: "VND" }),
          [name === "pricingType" ? "type" : name]: value,
        } as MarketplaceTopicMetadata["pricing"];
      else next[name] = value;
      return { ...record, marketplace: next } as MarketplaceRecord;
    });
  const saveDraft = async () => {
    if (!draft || !dirty) return;
    const recordToSave = "topicId" in draft
      ? {
          ...draft,
          marketplace: {
            ...draft.marketplace,
            subjects: draft.marketplace?.subjects?.slice(0, 1) ?? [],
          },
        }
      : draft;
    setBusy(true);
    try {
      await save(recordToSave);
      setSource(structuredClone(recordToSave));
      setDraft(structuredClone(recordToSave));
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void saveDraft();
  };
  useSaveShortcut({
    active: expanded,
    enabled: dirty && !busy,
    onSave: () => void saveDraft(),
  });

  return (
    <AccordionSection
      groupId="marketplace"
      variant="panel"
      expanded={expanded}
      onExpandedChange={setExpanded}
      title={copy.details}
      description={copy.topicDescription}
      actions={
        <>
          <Button
            color="neutral"
            icon={<RotateCcw />}
            disabled={!dirty || busy}
            onClick={() => source && setDraft(structuredClone(source))}
          >
            {copy.discard}
          </Button>
          <Button
            icon={<Save />}
            variant="solid"
            color="primary"
            disabled={!dirty || busy}
            loading={busy}
            type="submit"
            form={formId}
          >
            {copy.save}
          </Button>
        </>
      }
    >
      {draft ? (
        <form className="marketplace-metadata-form" id={formId} onSubmit={submit}>
          <Form fields={fields} values={values} onChange={change} />
        </form>
      ) : (
        <div className="ui-panel-loading"><span className="mini-spinner" /></div>
      )}
    </AccordionSection>
  );
}
