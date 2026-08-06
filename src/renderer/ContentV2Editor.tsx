import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  ContentV2Question,
  ContentV2Quiz,
  ContentV2Topic,
} from "../core/content-v2";
import type { AppSettings, RepositorySnapshot } from "../core/models";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { DialogFrame } from "./ui/DialogFrame";
import {
  Form,
  validateSchema,
  type FormErrors,
  type FormSchema,
  type FormValues,
} from "./ui/Form";

type RecordSelection =
  | { kind: "topic"; topicId: string }
  | { kind: "quiz"; topicId: string; quizId: string }
  | {
      kind: "question";
      topicId: string;
      quizId: string;
      questionId: string;
    };

interface Props {
  locale: AppSettings["locale"];
  selection: RecordSelection;
  onSnapshotChange(snapshot: RepositorySnapshot): void;
  onDeleted(snapshot: RepositorySnapshot): void;
}

const reviewOptions = ["draft", "pending", "reviewed", "rejected"].map(
  (value) => ({ value, label: value }),
);

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJson(value: unknown, label: string): unknown {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    throw new Error(`${label} must contain valid JSON.`);
  }
}

function fieldsFor(
  record: ContentV2Topic | ContentV2Quiz | ContentV2Question,
  copy: typeof en.contentV2,
): FormSchema[] {
  const common: FormSchema[] = [
    [
      {
        type: "text",
        name: "id",
        label: copy.fields.id,
        required: true,
        readOnly: true,
      },
      {
        type: "text",
        name: "type",
        label: copy.fields.type,
        required: true,
        readOnly: true,
      },
    ],
    [
      {
        type: "number",
        name: "order",
        label: copy.fields.order,
        min: 0,
        step: 1,
        required: true,
      },
      {
        type: "select",
        name: "status",
        label: copy.fields.reviewStatus,
        options: reviewOptions,
        required: true,
        presentation: "segmented",
      },
    ],
  ];
  if ("title" in record) {
    common.splice(
      1,
      0,
      { type: "text", name: "title", label: copy.fields.title, required: true },
      {
        type: "textarea",
        name: "description",
        label: copy.fields.description,
        rows: 3,
      },
    );
  }
  if (record.type === "competition")
    return [
      ...common,
      {
        type: "text",
        name: "subject",
        label: copy.fields.subject,
        required: true,
      },
      {
        type: "textarea",
        name: "roundsJson",
        label: copy.fields.rounds,
        rows: 7,
        required: true,
      },
      {
        type: "textarea",
        name: "gradeGroupsJson",
        label: copy.fields.gradeGroups,
        rows: 7,
        required: true,
      },
    ];
  if (record.type === "alphabet-learning")
    return [
      ...common,
      {
        type: "multi-select",
        name: "supportedLanguages",
        label: copy.fields.languages,
        options: [
          { value: "en", label: "English" },
          { value: "vi", label: "Tiếng Việt" },
        ],
        required: true,
      },
      [
        {
          type: "number",
          name: "minimumAge",
          label: copy.fields.minimumAge,
          min: 1,
          max: 18,
          required: true,
        },
        {
          type: "number",
          name: "maximumAge",
          label: copy.fields.maximumAge,
          min: 1,
          max: 18,
          required: true,
        },
      ],
    ];
  if (record.type === "competition-paper")
    return [
      ...common,
      [
        {
          type: "text",
          name: "grade",
          label: copy.fields.grade,
          required: true,
        },
        {
          type: "text",
          name: "round",
          label: copy.fields.round,
          required: true,
        },
        { type: "text", name: "year", label: copy.fields.year, required: true },
      ],
    ];
  if (record.type === "alphabet-course")
    return [
      ...common,
      {
        type: "select",
        name: "language",
        label: copy.fields.language,
        required: true,
        presentation: "segmented",
        options: [
          { value: "en", label: "English" },
          { value: "vi", label: "Tiếng Việt" },
        ],
      },
      {
        type: "text",
        name: "dictionary",
        label: copy.fields.dictionary,
        required: true,
      },
    ];
  if (record.type === "alphabet-letter")
    return [
      ...common,
      [
        {
          type: "text",
          name: "letter",
          label: copy.fields.letter,
          required: true,
        },
        {
          type: "text",
          name: "uppercase",
          label: copy.fields.uppercase,
          required: true,
        },
        {
          type: "text",
          name: "lowercase",
          label: copy.fields.lowercase,
          required: true,
        },
      ],
      { type: "text", name: "pronunciation", label: copy.fields.pronunciation },
    ];
  return [
    ...common,
    { type: "text", name: "category", label: copy.fields.category },
    {
      type: "textarea",
      name: "textEn",
      label: copy.fields.textEn,
      rows: 5,
      required: true,
    },
    { type: "textarea", name: "textVi", label: copy.fields.textVi, rows: 5 },
    {
      type: "textarea",
      name: "answerJson",
      label: copy.fields.answer,
      rows: 8,
      required: true,
    },
  ];
}

function valuesFor(
  record: ContentV2Topic | ContentV2Quiz | ContentV2Question,
): FormValues {
  const values: FormValues = { ...record };
  if (record.type === "competition") {
    values.roundsJson = safeJson(record.rounds);
    values.gradeGroupsJson = safeJson(record.gradeGroups);
  } else if (record.type === "alphabet-learning") {
    values.minimumAge = record.recommendedAgeRange.minimum;
    values.maximumAge = record.recommendedAgeRange.maximum;
  } else if (record.type === "competition-question") {
    values.textEn = Array.isArray(record.text.en)
      ? record.text.en.join("\n")
      : record.text.en;
    values.textVi = Array.isArray(record.text.vi)
      ? record.text.vi.join("\n")
      : (record.text.vi ?? "");
    values.answerJson = safeJson(record.answer);
  }
  return values;
}

function recordFromValues(
  record: ContentV2Topic | ContentV2Quiz | ContentV2Question,
  values: FormValues,
): ContentV2Topic | ContentV2Quiz | ContentV2Question {
  const common = {
    ...record,
    order: Number(values.order),
    status: String(values.status),
    ...("title" in record
      ? {
          title: String(values.title).trim(),
          description: String(values.description ?? "").trim(),
        }
      : {}),
  };
  if (record.type === "competition")
    return {
      ...common,
      type: record.type,
      subject: String(values.subject).trim(),
      rounds: parseJson(values.roundsJson, "Rounds") as typeof record.rounds,
      gradeGroups: parseJson(
        values.gradeGroupsJson,
        "Grade groups",
      ) as typeof record.gradeGroups,
    } as ContentV2Topic;
  if (record.type === "alphabet-learning")
    return {
      ...common,
      type: record.type,
      supportedLanguages: values.supportedLanguages as ("en" | "vi")[],
      recommendedAgeRange: {
        minimum: Number(values.minimumAge),
        maximum: Number(values.maximumAge),
      },
    } as ContentV2Topic;
  if (record.type === "competition-paper")
    return {
      ...common,
      type: record.type,
      grade: String(values.grade).trim(),
      round: String(values.round).trim(),
      year: String(values.year).trim(),
    } as ContentV2Quiz;
  if (record.type === "alphabet-course")
    return {
      ...common,
      type: record.type,
      language: values.language as "en" | "vi",
      dictionary: String(values.dictionary).trim(),
    } as ContentV2Quiz;
  if (record.type === "alphabet-letter")
    return {
      ...common,
      type: record.type,
      letter: String(values.letter).trim(),
      uppercase: String(values.uppercase).trim(),
      lowercase: String(values.lowercase).trim(),
      pronunciation: String(values.pronunciation ?? "").trim() || undefined,
    } as ContentV2Question;
  return {
    ...common,
    type: record.type,
    category: String(values.category ?? "").trim() || undefined,
    text: {
      en: String(values.textEn),
      ...(String(values.textVi ?? "").trim()
        ? { vi: String(values.textVi) }
        : {}),
    },
    answer: parseJson(values.answerJson, "Answer") as Record<string, unknown>,
  } as ContentV2Question;
}

export function ContentV2Editor({
  locale,
  selection,
  onSnapshotChange,
  onDeleted,
}: Props) {
  const copy = (locale === "vi" ? vi : en).contentV2;
  const [record, setRecord] = useState<
    ContentV2Topic | ContentV2Quiz | ContentV2Question | null
  >(null);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);
    const request =
      selection.kind === "topic"
        ? window.getgo.loadContentV2Topic(selection.topicId)
        : selection.kind === "quiz"
          ? window.getgo.loadContentV2Quiz(selection.topicId, selection.quizId)
          : window.getgo.loadContentV2Question(
              selection.topicId,
              selection.quizId,
              selection.questionId,
            );
    void request
      .then((next) => {
        if (!current) return;
        setRecord(next);
        setValues(valuesFor(next));
      })
      .catch(
        (cause) =>
          current &&
          setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [selection]);

  const fields = useMemo(
    () => (record ? fieldsFor(record, copy) : []),
    [copy, record],
  );
  const change = (name: string, value: unknown) => {
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    setValues((current) => ({ ...current, [name]: value }));
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    const nextErrors = validateSchema(fields, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setError(null);
    try {
      const next = recordFromValues(record, values);
      const snapshot =
        selection.kind === "topic"
          ? await window.getgo.saveContentV2Topic(next as ContentV2Topic)
          : selection.kind === "quiz"
            ? await window.getgo.saveContentV2Quiz(
                selection.topicId,
                next as ContentV2Quiz,
              )
            : await window.getgo.saveContentV2Question(
                selection.topicId,
                selection.quizId,
                next as ContentV2Question,
              );
      setRecord(next);
      setValues(valuesFor(next));
      onSnapshotChange(snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogFrame
      presentation="embedded"
      embeddedFooter
      title={record ? copy.typeNames[record.type] : copy.editorTitle}
      busy={loading || saving}
      error={error}
      onClose={() => undefined}
      onSubmit={submit}
      submitLabel={copy.save}
      onDelete={async () => {
        const snapshot =
          selection.kind === "topic"
            ? await window.getgo.deleteContentV2Topic(selection.topicId)
            : selection.kind === "quiz"
              ? await window.getgo.deleteContentV2Quiz(
                  selection.topicId,
                  selection.quizId,
                )
              : await window.getgo.deleteContentV2Question(
                  selection.topicId,
                  selection.quizId,
                  selection.questionId,
                );
        onDeleted(snapshot);
      }}
    >
      {record && (
        <Form
          fields={fields}
          values={values}
          errors={errors}
          onChange={change}
        />
      )}
    </DialogFrame>
  );
}
