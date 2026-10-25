import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import type { QuizSourceExtractImage, QuizSourceExtraction } from "../../../../shared/domain/pdf-source-extraction";
import * as ui from "../../../../shared/ui";

export type PdfImagePickerCopy = {
  title: string;
  addTitle: string;
  loading: string;
  empty: string;
  select: string;
  selectMultiple: string;
  cancel: string;
  page: string;
  imageLabel: string;
  replaceFailed: string;
  addFailed: string;
};

function ExtractedImageThumbnail({
  manifestPath,
  image,
  selected,
  selectedOrder,
  copy,
  onSelect,
}: {
  manifestPath: string;
  image: QuizSourceExtractImage;
  selected: boolean;
  selectedOrder?: number;
  copy: PdfImagePickerCopy;
  onSelect(event: MouseEvent<HTMLButtonElement>): void;
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
        {selectedOrder !== undefined && (
          <span className="pdf-extracted-image-order" aria-hidden="true">{selectedOrder}</span>
        )}
      </span>
      <span>{copy.page.replace("{page}", String(image.page))}</span>
    </button>
  );
}

export function PdfExtractedImagePickerDialog({
  manifestPath,
  targetReference,
  addImages,
  copy,
  onClose,
}: {
  manifestPath: string;
  targetReference?: string;
  addImages?: (references: string[]) => Promise<void>;
  copy: PdfImagePickerCopy;
  onClose(): void;
}) {
  const [extraction, setExtraction] = useState<QuizSourceExtraction | null>(null);
  const [selected, setSelected] = useState<QuizSourceExtractImage[]>([]);
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
    if (!selected.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (targetReference) {
        const result = await window.getgo.replaceQuizAssetFromSourceExtract(
          manifestPath,
          targetReference,
          selected[0].asset,
        );
        window.dispatchEvent(new CustomEvent("getgo:quiz-asset-updated", {
          detail: { manifestPath, reference: targetReference, preview: result.preview },
        }));
      } else if (addImages) {
        const results = await Promise.all(selected.map((image) =>
          window.getgo.addQuizAssetFromSourceExtract(manifestPath, image.asset)
        ));
        await addImages(results.map((result) => result.reference));
      } else {
        throw new Error("No image destination was selected.");
      }
      onClose();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(`${targetReference ? copy.replaceFailed : copy.addFailed} ${detail}`.trim());
      setBusy(false);
    }
  };

  return (
    <ui.DialogFrame
      presentation="modal"
      className="pdf-extracted-image-dialog"
      title={targetReference ? copy.title : copy.addTitle}
      busy={busy}
      error={error}
      cancelLabel={copy.cancel}
      submitLabel={targetReference ? copy.select : copy.selectMultiple}
      submitDisabled={loading || !selected.length}
      onClose={onClose}
      onSubmit={apply}
    >
      {loading ? (
        <ui.PageLoading label={copy.loading} className="pdf-extracted-image-loading" />
      ) : extraction?.images.length ? (
        <div className="pdf-extracted-image-grid">
          {extraction.images.map((image) => {
            const selectedIndex = selected.findIndex((item) => item.id === image.id);
            return (
              <ExtractedImageThumbnail
                key={image.id}
                manifestPath={manifestPath}
                image={image}
                selected={selectedIndex >= 0}
                selectedOrder={selectedIndex >= 0 && !targetReference ? selectedIndex + 1 : undefined}
                copy={copy}
                onSelect={(event) => setSelected((current) => {
                  if (targetReference) return [image];
                  if (!event.metaKey && !event.ctrlKey) return [image];
                  const currentIndex = current.findIndex((item) => item.id === image.id);
                  return currentIndex >= 0
                    ? current.filter((_, index) => index !== currentIndex)
                    : [...current, image];
                })}
              />
            );
          })}
        </div>
      ) : !error ? (
        <p className="pdf-extracted-image-empty">{copy.empty}</p>
      ) : null}
    </ui.DialogFrame>
  );
}
