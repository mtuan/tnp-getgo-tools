import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
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
    previewImage: string;
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
    orientation: record?.orientation ?? ((clipboard?.width ?? 0) > (clipboard?.height ?? 0) ? "landscape" : "portrait"),
    theme: record?.theme ?? "light",
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
      [{ name: "orientation", type: "select", label: "Orientation", options: [{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }], presentation: "segmented" },
        { name: "theme", type: "select", label: "Theme", options: [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }], presentation: "segmented" }],
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
        orientation: values.orientation === "landscape" ? "landscape" : "portrait",
        theme: values.theme === "dark" ? "dark" : "light",
      });
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  const preview = record?.previewDataUrl ?? clipboard?.previewDataUrl;
  const dimensions = record
    ? `${record.width} × ${record.height}`
    : clipboard
      ? `${clipboard.width} × ${clipboard.height}`
      : "";
  const previewWidth = record?.width ?? clipboard?.width ?? 1;
  const previewHeight = record?.height ?? clipboard?.height ?? 1;
  return (
    <ui.DialogFrame
      presentation="modal"
      className="screenshot-editor-dialog"
      title={record ? copy.editScreenshot : copy.addScreenshot}
      busy={busy}
      error={submitError}
      submitLabel={record ? copy.save : copy.addScreenshot}
      onClose={onClose}
      onSubmit={submit}
    >
      <div className="screenshot-editor-layout">
        <div className="screenshot-editor-fields">
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
        </div>
        {preview && <figure className="screenshot-editor-preview" style={{ "--screenshot-image-ratio": `${previewWidth} / ${previewHeight}` } as CSSProperties}><ui.Image src={preview} fit="contain" alt={record ? copy.previewImage : copy.clipboardPreview} /><figcaption>{dimensions}</figcaption></figure>}
      </div>
    </ui.DialogFrame>
  );
}
