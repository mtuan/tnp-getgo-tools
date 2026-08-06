import { useMemo, useState, type FormEvent } from "react";
import type {
  ContentV2Question,
  ContentV2Quiz,
  ContentV2Topic,
  ContentV2TopicType,
} from "../core/content-v2";
import type {
  AppSettings,
  ContentV2QuizSummary,
  ContentV2TopicSummary,
  RepositorySnapshot,
} from "../core/models";
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

type Selection =
  | { kind: "topic" }
  | { kind: "quiz"; topic: ContentV2TopicSummary }
  | {
      kind: "question";
      topic: ContentV2TopicSummary;
      quiz: ContentV2QuizSummary;
    };

interface Props {
  locale: AppSettings["locale"];
  selection: Selection;
  nextOrder: number;
  onClose(): void;
  onSaved(snapshot: RepositorySnapshot): void;
}

export function ContentV2CreateDialog({
  locale,
  selection,
  nextOrder,
  onClose,
  onSaved,
}: Props) {
  const copy = (locale === "vi" ? vi : en).contentV2;
  const defaultType =
    selection.kind === "topic"
      ? "competition"
      : selection.kind === "quiz"
        ? selection.topic.type === "competition"
          ? "competition-paper"
          : "alphabet-course"
        : selection.quiz.type === "competition-paper"
          ? "competition-question"
          : "alphabet-letter";
  const [values, setValues] = useState<FormValues>({
    type: defaultType,
    id: "",
    title: "",
    language: "en",
    grade: "",
    round: "",
    year: "",
    letter: "",
    uppercase: "",
    lowercase: "",
    textEn: "",
    answerJson: '{\n  "type": "input",\n  "correct": ""\n}',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useMemo<FormSchema[]>(() => {
    const type = String(values.type);
    const typeOptions =
      selection.kind === "topic"
        ? (["competition", "alphabet-learning"] as const).map((value) => ({
            value,
            label: copy.typeNames[value],
          }))
        : [{ value: defaultType, label: copy.typeNames[defaultType] }];
    return [
      {
        type: "select",
        name: "type",
        label: copy.fields.type,
        options: typeOptions,
        required: true,
        presentation: "segmented",
        readOnly: typeOptions.length === 1,
      },
      {
        type: "text",
        name: "id",
        label: copy.fields.id,
        required: true,
        rules: {
          pattern: { value: /^[a-z][a-z0-9-]*$/, message: copy.invalidId },
        },
      },
      ...(selection.kind !== "question"
        ? [
            {
              type: "text",
              name: "title",
              label: copy.fields.title,
              required: true,
            } as FormSchema,
          ]
        : []),
      ...(type === "competition"
        ? ([
            {
              type: "text",
              name: "subject",
              label: copy.fields.subject,
              required: true,
            },
          ] as FormSchema[])
        : []),
      ...(type === "alphabet-course"
        ? ([
            {
              type: "select",
              name: "language",
              label: copy.fields.language,
              required: true,
              options: [
                { value: "en", label: "English" },
                { value: "vi", label: "Tiếng Việt" },
              ],
              presentation: "segmented",
            },
          ] as FormSchema[])
        : []),
      ...(type === "competition-paper"
        ? ([
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
              {
                type: "text",
                name: "year",
                label: copy.fields.year,
                required: true,
              },
            ],
          ] as FormSchema[])
        : []),
      ...(type === "alphabet-letter"
        ? ([
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
          ] as FormSchema[])
        : []),
      ...(type === "competition-question"
        ? ([
            {
              type: "textarea",
              name: "textEn",
              label: copy.fields.textEn,
              rows: 5,
              required: true,
            },
            {
              type: "textarea",
              name: "answerJson",
              label: copy.fields.answer,
              rows: 7,
              required: true,
            },
          ] as FormSchema[])
        : []),
    ];
  }, [copy, defaultType, selection.kind, values.type]);
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
    const nextErrors = validateSchema(fields, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    setError(null);
    try {
      const id = String(values.id).trim();
      const type = String(values.type);
      let snapshot: RepositorySnapshot;
      if (selection.kind === "topic") {
        const common = {
          schemaVersion: 2 as const,
          id,
          type: type as ContentV2TopicType,
          title: String(values.title).trim(),
          description: "",
          status: "draft" as const,
          order: nextOrder,
        };
        const topic: ContentV2Topic =
          type === "competition"
            ? {
                ...common,
                type: "competition",
                subject: String(values.subject).trim(),
                rounds: [],
                gradeGroups: [],
              }
            : {
                ...common,
                type: "alphabet-learning",
                supportedLanguages: ["en", "vi"],
                recommendedAgeRange: { minimum: 3, maximum: 7 },
              };
        snapshot = await window.getgo.saveContentV2Topic(topic);
      } else if (selection.kind === "quiz") {
        const common = {
          schemaVersion: 2 as const,
          id,
          topicId: selection.topic.id,
          title: String(values.title).trim(),
          description: "",
          status: "draft" as const,
          order: nextOrder,
        };
        const quiz: ContentV2Quiz =
          type === "competition-paper"
            ? {
                ...common,
                type: "competition-paper",
                grade: String(values.grade).trim(),
                round: String(values.round).trim(),
                year: String(values.year).trim(),
              }
            : {
                ...common,
                type: "alphabet-course",
                language: values.language as "en" | "vi",
                dictionary: "resources/dictionary.json",
              };
        snapshot = await window.getgo.saveContentV2Quiz(
          selection.topic.id,
          quiz,
        );
      } else {
        const common = {
          schemaVersion: 2 as const,
          id,
          order: nextOrder,
          status: "pending" as const,
        };
        const question: ContentV2Question =
          type === "alphabet-letter"
            ? {
                ...common,
                type: "alphabet-letter",
                letter: String(values.letter).trim(),
                uppercase: String(values.uppercase).trim(),
                lowercase: String(values.lowercase).trim(),
              }
            : {
                ...common,
                type: "competition-question",
                text: { en: String(values.textEn) },
                assets: [],
                answer: JSON.parse(String(values.answerJson)) as Record<
                  string,
                  unknown
                >,
              };
        snapshot = await window.getgo.saveContentV2Question(
          selection.topic.id,
          selection.quiz.id,
          question,
        );
      }
      onSaved(snapshot);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy(false);
    }
  }
  return (
    <DialogFrame
      title={
        selection.kind === "topic"
          ? copy.createTopic
          : selection.kind === "quiz"
            ? copy.createQuiz
            : copy.createQuestion
      }
      submitLabel={copy.create}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <Form fields={fields} values={values} errors={errors} onChange={change} />
    </DialogFrame>
  );
}
