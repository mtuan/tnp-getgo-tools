import { useEffect, useState, type FormEvent } from "react";
import type { QuizSourceExtractImage, QuizSourceExtraction } from "../../../../shared/domain/pdf-source-extraction";
import * as ui from "../../../../shared/ui";

export type PdfImagePickerCopy = {
  title: string;
  loading: string;
  empty: string;
  select: string;
  cancel: string;
  page: string;
  imageLabel: string;
  replaceFailed: string;
};

function ExtractedImageThumbnail({
  manifestPath,
  image,
  selected,
  copy,
  onSelect,
}: {
  manifestPath: string;
  image: QuizSourceExtractImage;
  selected: boolean;
  copy: PdfImagePickerCopy;
  onSelect(): void;
}) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setSource("");
    setFailed(false);
    void window.getgo.readQuizSourceExtractImage(manifestPath, image.asset)
      .then((value) => { if (active) setSource(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [image.asset, manifestPath]);
  if (failed) return null;
  const label = copy.imageLabel
    .replace("{id}", image.id)
    .replace("{page}", String(image.page));
  return (
    <button
      type="button"
      className={`pdf-extracted-image-option${selected ? " is-selected" : ""}`}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="pdf-extracted-image-preview">
        {source ? <img src={source} alt="" /> : <span className="mini-spinner" aria-hidden="true" />}
      </span>
      <span>{copy.page.replace("{page}", String(image.page))}</span>
    </button>
  );
}

export function PdfExtractedImagePickerDialog({
  manifestPath,
  targetReference,
  copy,
  onClose,
}: {
  manifestPath: string;
  targetReference: string;
  copy: PdfImagePickerCopy;
  onClose(): void;
}) {
  const [extraction, setExtraction] = useState<QuizSourceExtraction | null>(null);
  const [selected, setSelected] = useState<QuizSourceExtractImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.getgo.ensureQuizSourceExtraction(manifestPath)
      .then((result) => { if (active) setExtraction(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [manifestPath]);

  const apply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.getgo.replaceQuizAssetFromSourceExtract(
        manifestPath,
        targetReference,
        selected.asset,
      );
      window.dispatchEvent(new CustomEvent("getgo:quiz-asset-updated", {
        detail: { manifestPath, reference: targetReference, preview: result.preview },
      }));
      onClose();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(`${copy.replaceFailed} ${detail}`.trim());
      setBusy(false);
    }
  };

  return (
    <ui.DialogFrame
      presentation="modal"
      className="pdf-extracted-image-dialog"
      title={copy.title}
      busy={busy}
      error={error}
      cancelLabel={copy.cancel}
      submitLabel={copy.select}
      submitDisabled={loading || !selected}
      onClose={onClose}
      onSubmit={apply}
    >
      {loading ? (
        <ui.PageLoading label={copy.loading} className="pdf-extracted-image-loading" />
      ) : extraction?.images.length ? (
        <div className="pdf-extracted-image-grid">
          {extraction.images.map((image) => (
            <ExtractedImageThumbnail
              key={image.id}
              manifestPath={manifestPath}
              image={image}
              selected={selected?.id === image.id}
              copy={copy}
              onSelect={() => setSelected(image)}
            />
          ))}
        </div>
      ) : !error ? (
        <p className="pdf-extracted-image-empty">{copy.empty}</p>
      ) : null}
    </ui.DialogFrame>
  );
}
