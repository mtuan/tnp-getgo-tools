import { useEffect, useMemo, useRef, useState } from "react";
import { History, ImagePlus, Pencil, Zap } from "lucide-react";
import type { ContestQuizQuestionRecord } from "../../../../shared/domain/models";
import * as ui from "../../../../shared/ui";
import { questionService, type GeneratedQuestion } from "../../../quiz-editor/components/question-service";
import { questionHasDynamicParams } from "../../../quiz-editor/domain/question-dynamics";
import { PdfExtractedImagePickerDialog, type PdfImagePickerCopy } from "./PdfExtractedImagePickerDialog";

type CompareMode = "original" | "dynamic";
type CompareCopy = {
  generateOriginal: string;
  generateQuestion: string;
  editQuestion: string;
  addImage: string;
  questionLabel: string;
  pdfTitle: string;
  loading: string;
  empty: string;
  pdfUnavailable: string;
  questionFailed: string;
  imagePicker: PdfImagePickerCopy;
};
type PreviewResult = {
  record: ContestQuizQuestionRecord;
  generated?: GeneratedQuestion;
  error?: string;
};

async function generateQuestion(
  record: ContestQuizQuestionRecord,
  questions: ContestQuizQuestionRecord[],
  sharedCode: string,
  mode: CompareMode,
): Promise<GeneratedQuestion> {
  const original = mode === "original";
  let generated: GeneratedQuestion;
  if (record.authoringMode === "reference")
    generated = await questionService.generateReference(record, questions, sharedCode, original);
  else if (questionHasDynamicParams(record.advancedDynamic))
    generated = await questionService.generateDynamic(record, original, sharedCode);
  else
    generated = questionService.loadStatic(record);
  const recordImages = Array.isArray(record.image_datas)
    ? record.image_datas.filter((value): value is string => typeof value === "string")
    : [];
  if (!recordImages.length) return generated;
  const generatedImages = Array.isArray(generated.question.image_datas)
    ? generated.question.image_datas.filter((value): value is string => typeof value === "string")
    : [];
  return {
    ...generated,
    question: {
      ...generated.question,
      image_datas: Array.from(new Set([...generatedImages, ...recordImages])),
    },
  };
}

export function QuizCompareTab({
  manifestPath,
  questions,
  activeQuestionNumber,
  sharedCode = "",
  copy,
  onEditQuestion,
  onAddImages,
}: {
  manifestPath: string;
  questions: ContestQuizQuestionRecord[];
  activeQuestionNumber?: string;
  sharedCode?: string;
  copy: CompareCopy;
  onEditQuestion: (record: ContestQuizQuestionRecord) => void;
  onAddImages: (record: ContestQuizQuestionRecord, references: string[]) => Promise<void>;
}) {
  const [previews, setPreviews] = useState<PreviewResult[] | null>(null);
  const [pendingModes, setPendingModes] = useState<Record<string, CompareMode | undefined>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [imageTarget, setImageTarget] = useState<
    | { kind: "replace"; reference: string }
    | { kind: "add"; record: ContestQuizQuestionRecord }
    | null
  >(null);
  const generationVersions = useRef(new Map<string, number>());
  const previewsRef = useRef<PreviewResult[] | null>(null);
  const inputRecordsRef = useRef(new Map<string, ContestQuizQuestionRecord>());
  const inputSharedCodeRef = useRef(sharedCode);
  const questionScrollRegion = useRef<HTMLDivElement>(null);
  const questionElements = useRef(new Map<string, HTMLElement>());
  const sortedQuestions = useMemo(
    () => [...questions].sort((left, right) => Number(left.question_no) - Number(right.question_no)),
    [questions],
  );
  const previewsReady = previews !== null;

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    if (!activeQuestionNumber) return;
    const frame = window.requestAnimationFrame(() => {
      const region = questionScrollRegion.current;
      const question = questionElements.current.get(activeQuestionNumber);
      if (!region || !question) return;
      const regionBounds = region.getBoundingClientRect();
      const questionBounds = question.getBoundingClientRect();
      region.scrollTo({
        behavior: "smooth",
        top: region.scrollTop + questionBounds.top - regionBounds.top,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeQuestionNumber, previewsReady]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPdfUrl(null);
    setPdfError(null);
    void window.getgo.readQuizSourcePdf(manifestPath).then((bytes) => {
      if (!active) return;
      const buffer = new Uint8Array(bytes.byteLength);
      buffer.set(bytes);
      objectUrl = URL.createObjectURL(new Blob([buffer.buffer], { type: "application/pdf" }));
      setPdfUrl(objectUrl);
    }).catch((cause) => {
      if (active) setPdfError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [manifestPath]);

  useEffect(() => {
    let active = true;
    const previousRecords = inputRecordsRef.current;
    const previousPreviews = new Map(
      (previewsRef.current ?? []).map((preview) => [String(preview.record.question_no), preview]),
    );
    const sharedCodeChanged = inputSharedCodeRef.current !== sharedCode;
    inputRecordsRef.current = new Map(
      sortedQuestions.map((record) => [String(record.question_no), record]),
    );
    inputSharedCodeRef.current = sharedCode;
    if (!previewsRef.current) {
      generationVersions.current.clear();
      setPendingModes({});
    }
    void Promise.all(sortedQuestions.map(async (record): Promise<PreviewResult> => {
      const key = String(record.question_no);
      const existing = previousPreviews.get(key);
      if (!sharedCodeChanged && previousRecords.get(key) === record && existing)
        return { ...existing, record };
      generationVersions.current.set(key, (generationVersions.current.get(key) ?? 0) + 1);
      try {
        return { record, generated: await generateQuestion(record, sortedQuestions, sharedCode, "original") };
      } catch (cause) {
        return { record, error: cause instanceof Error ? cause.message : String(cause) };
      }
    })).then((result) => {
      if (!active) return;
      previewsRef.current = result;
      setPreviews(result);
    });
    return () => { active = false; };
  }, [sharedCode, sortedQuestions]);

  const generatePreview = async (record: ContestQuizQuestionRecord, mode: CompareMode) => {
    const questionKey = String(record.question_no);
    const generationVersion = (generationVersions.current.get(questionKey) ?? 0) + 1;
    generationVersions.current.set(questionKey, generationVersion);
    setPendingModes((current) => ({ ...current, [questionKey]: mode }));
    try {
      const generated = await generateQuestion(record, sortedQuestions, sharedCode, mode);
      if (generationVersions.current.get(questionKey) !== generationVersion) return;
      setPreviews((current) => current?.map((preview) =>
        String(preview.record.question_no) === questionKey
          ? { record: preview.record, generated }
          : preview,
      ) ?? current);
    } catch (cause) {
      if (generationVersions.current.get(questionKey) !== generationVersion) return;
      setPreviews((current) => current?.map((preview) =>
        String(preview.record.question_no) === questionKey
          ? { record: preview.record, error: cause instanceof Error ? cause.message : String(cause) }
          : preview,
      ) ?? current);
    } finally {
      if (generationVersions.current.get(questionKey) === generationVersion) {
        setPendingModes((current) => ({ ...current, [questionKey]: undefined }));
      }
    }
  };

  return (
    <div className="quiz-compare-workspace">
      <section className="quiz-compare-column quiz-compare-questions">
        <div className="quiz-compare-scroll-region" ref={questionScrollRegion}>
          {!previews ? (
            <ui.PageLoading label={copy.loading} className="quiz-compare-loading" />
          ) : previews.length === 0 ? (
            <ui.PanelBody><p className="quiz-compare-empty">{copy.empty}</p></ui.PanelBody>
          ) : (
            <div className="quiz-compare-question-list">
              {previews.map((preview) => (
                <article
                  className={`quiz-compare-question${String(preview.record.question_no) === activeQuestionNumber ? " is-selected" : ""}`}
                  key={String(preview.record.question_no)}
                  ref={(element) => {
                    const key = String(preview.record.question_no);
                    if (element) questionElements.current.set(key, element);
                    else questionElements.current.delete(key);
                  }}
                >
                  <header className="quiz-compare-question-header">
                    <span className="quiz-compare-question-title">
                      {copy.questionLabel.replace("{number}", String(preview.record.question_no))}
                    </span>
                    <span className="question-preview-actions">
                      <ui.Button
                        variant="icon"
                        color="primary"
                        title={copy.addImage}
                        aria-label={copy.addImage}
                        icon={<ImagePlus size={16} />}
                        onClick={() => setImageTarget({
                          kind: "add",
                          record: preview.record,
                        })}
                      />
                      <ui.Button
                        variant="icon"
                        color="primary"
                        title={copy.editQuestion}
                        aria-label={copy.editQuestion}
                        icon={<Pencil size={16} />}
                        onClick={() => onEditQuestion(preview.record)}
                      />
                      <ui.Button
                        variant="icon"
                        title={copy.generateOriginal}
                        aria-label={copy.generateOriginal}
                        icon={<History size={16} />}
                        loading={pendingModes[String(preview.record.question_no)] === "original"}
                        disabled={Boolean(pendingModes[String(preview.record.question_no)])}
                        onClick={() => void generatePreview(preview.record, "original")}
                      />
                      <ui.Button
                        variant="icon"
                        title={copy.generateQuestion}
                        aria-label={copy.generateQuestion}
                        icon={<Zap size={16} />}
                        loading={pendingModes[String(preview.record.question_no)] === "dynamic"}
                        disabled={Boolean(pendingModes[String(preview.record.question_no)])}
                        onClick={() => void generatePreview(preview.record, "dynamic")}
                      />
                    </span>
                  </header>
                  {preview.error || !preview.generated ? (
                    <ui.ErrorFrame message={`${copy.questionFailed} ${preview.error ?? ""}`.trim()} />
                  ) : (
                    <ui.QuestionPreview
                      question={preview.generated.question}
                      params={preview.generated.params}
                      manifestPath={manifestPath}
                      choiceLayout="horizontal"
                      density="compact"
                      onImageClick={(reference) => setImageTarget({
                        kind: "replace",
                        reference,
                      })}
                      imageActionLabel={copy.imagePicker.title}
                    />
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="quiz-compare-column quiz-compare-pdf">
        <div className="quiz-compare-pdf-region">
          {pdfError ? (
            <ui.PanelBody><ui.ErrorFrame message={`${copy.pdfUnavailable} ${pdfError}`} /></ui.PanelBody>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title={copy.pdfTitle} />
          ) : (
            <ui.PageLoading label={copy.loading} className="quiz-compare-loading" />
          )}
        </div>
      </section>
      {imageTarget && (
        <PdfExtractedImagePickerDialog
          manifestPath={manifestPath}
          targetReference={imageTarget.kind === "replace"
            ? imageTarget.reference
            : undefined}
          addImages={imageTarget.kind === "add"
            ? (references) => onAddImages(imageTarget.record, references)
            : undefined}
          copy={copy.imagePicker}
          onClose={() => setImageTarget(null)}
        />
      )}
    </div>
  );
}
