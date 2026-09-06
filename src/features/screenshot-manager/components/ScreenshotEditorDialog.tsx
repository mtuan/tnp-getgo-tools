import { useMemo, useState, type FormEvent } from "react";
import * as ui from "../../../shared/ui";
import type {
  ScreenshotMetadataInput,
  ClipboardScreenshot,
  ScreenshotRecord,
} from "../domain/screenshot-project";

export function ScreenshotEditorDialog({
  record,
  copy,
  busy,
  clipboard,
  onClose,
  onSave,
}: {
  record?: ScreenshotRecord;
  copy: {
    defaultScreenshotName: string;
    name: string;
    route: string;
    description: string;
    editScreenshot: string;
    addScreenshot: string;
    save: string;
    clipboardPreview: string;
    pasteHint: string;
  };
  busy: boolean;
  clipboard?: ClipboardScreenshot;
  onClose(): void;
  onSave(input: ScreenshotMetadataInput): Promise<void>;
}) {
  const [values, setValues] = useState<ui.FormValues>({
    name: record?.name ?? copy.defaultScreenshotName,
    route: record?.route ?? "/",
    description: record?.description ?? "",
  });
  const [errors, setErrors] = useState<ui.FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fields = useMemo<ui.FormSchema[]>(
    () => [
      {
        name: "name",
        type: "text",
        label: copy.name,
        required: true,
        maxLength: 120,
      },
      {
        name: "route",
        type: "text",
        label: copy.route,
        required: true,
        placeholder: "/parent/home",
      },
      {
        name: "description",
        type: "textarea",
        label: copy.description,
        rows: 4,
        maxLength: 500,
      },
    ],
    [copy],
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = ui.validateSchema(fields, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitError(null);
    try {
      await onSave({
        name: String(values.name),
        route: String(values.route),
        description: String(values.description ?? ""),
      });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <ui.DialogFrame
      presentation="modal"
      title={record ? copy.editScreenshot : copy.addScreenshot}
      busy={busy}
      error={submitError}
      submitLabel={record ? copy.save : copy.addScreenshot}
      onClose={onClose}
      onSubmit={submit}
    >
      {clipboard && <div className="screenshot-clipboard-preview"><ui.Image src={clipboard.previewDataUrl} alt={copy.clipboardPreview} /><span>{clipboard.width} × {clipboard.height}</span></div>}
      <ui.Form
        fields={fields}
        values={values}
        errors={errors}
        onChange={(name, value) => {
          setValues((current) => ({ ...current, [name]: value }));
          setErrors((current) => ({ ...current, [name]: "" }));
        }}
      />
      {!record && <p className="screenshot-paste-note">{copy.pasteHint}</p>}
    </ui.DialogFrame>
  );
}
