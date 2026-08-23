import { useMemo, useState, type FormEvent } from "react";
import { RotateCcw, Save } from "lucide-react";
import { compileQuizSharedCode } from "@tnp/getgo-logics/authoring";
import type { QuizSummary, RepositoryViewData } from "../../../../shared/domain/models";
import { Button } from "../../../../shared/ui/Button";
import { Form, validateSchema, type FormErrors, type FormSchema } from "../../../../shared/ui/Form";
import { Panel } from "../../../../shared/ui/Panel";
import { DialogFrame } from "../../../../shared/ui/DialogFrame";
import type { QuizManagerApi } from "./shared";

export function QuizSharedCodeTab({
  quiz,
  api,
  onSnapshotChange,
  onQuizChange,
  notify,
  presentation = "panel",
  onClose,
}: {
  quiz: QuizSummary;
  api: QuizManagerApi;
  onSnapshotChange(snapshot: RepositoryViewData): void;
  onQuizChange(quiz: QuizSummary): void;
  notify(message: string, description: string, error?: boolean): void;
  presentation?: "panel" | "drawer";
  onClose?(): void;
}) {
  const [value, setValue] = useState(quiz.sharedCode ?? "");
  const [savedValue, setSavedValue] = useState(quiz.sharedCode ?? "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const dirty = value !== savedValue;
  const fields = useMemo<FormSchema[]>(() => [{
    type: "code",
    name: "sharedCode",
    label: "Shared question code",
    helper: "Define reusable TypeScript declarations directly. They are exposed to dynamic questions through QS.member at runtime; do not add a QS wrapper.",
    path: `${quiz.relativePath}/shared-code.ts`,
    language: "typescript",
    minHeight: 320,
    rules: {
      validate: source => {
        try {
          compileQuizSharedCode(String(source ?? ""));
          return null;
        } catch (cause) {
          return cause instanceof Error ? cause.message : String(cause);
        }
      },
    },
  }], [quiz.relativePath]);

  const discard = () => {
    setValue(savedValue);
    setErrors({});
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateSchema(fields, { sharedCode: value });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || !dirty || saving) return;
    setSaving(true);
    try {
      const sharedCode = value.trim();
      const stored = await api.loadContentV2Quiz(quiz.contest, quiz.id);
      const next = await api.saveContentV2Quiz(quiz.contest, {
        ...stored,
        sharedCode,
      });
      onSnapshotChange(next);
      const updated = next.quizzes.find(item => item.key === quiz.key);
      if (updated) onQuizChange(updated);
      setValue(sharedCode);
      setSavedValue(sharedCode);
      notify("Shared code saved", "The code is now available to every dynamic question in this quiz.");
      if (presentation === "drawer") onClose?.();
    } catch (cause) {
      notify("Could not save shared code", cause instanceof Error ? cause.message : String(cause), true);
    } finally {
      setSaving(false);
    }
  };

  const editor = <Form fields={fields} values={{ sharedCode: value }} errors={errors} onChange={(_name, next) => { setValue(String(next ?? "")); setErrors({}); }} />;
  if (presentation === "drawer") return <DialogFrame
    presentation="drawer"
    className="quiz-shared-code-drawer"
    title="Shared question code"
    busy={saving}
    error={null}
    onClose={() => onClose?.()}
    onSubmit={save}
    onReset={discard}
    submitLabel="Save"
    submitDisabled={!dirty || saving || Object.keys(errors).length > 0}
    saveShortcut
    leadingAction={<Button type="reset" icon={<RotateCcw />} color="neutral" disabled={!dirty || saving}>Discard</Button>}
  >
    {editor}
  </DialogFrame>;

  return <Panel
    className="quiz-shared-code-panel"
    title="Shared question code"
    description="Define reusable TypeScript declarations; the QS (Quiz Shared) namespace is injected automatically."
    meta={<div className="ui-panel-actions">
      <Button icon={<RotateCcw />} color="neutral" disabled={!dirty || saving} onClick={discard}>Discard</Button>
      <Button type="submit" form="quiz-shared-code-form" icon={<Save />} variant="solid" color="primary" disabled={!dirty || saving} loading={saving}>Save</Button>
    </div>}
  >
    <form id="quiz-shared-code-form" onSubmit={save}>
      {editor}
    </form>
  </Panel>;
}
