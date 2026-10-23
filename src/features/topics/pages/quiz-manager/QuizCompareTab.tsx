import { useEffect, useMemo, useRef, useState } from "react";
import { History, Zap } from "lucide-react";
import type { ContestQuizQuestionRecord } from "../../../../shared/domain/models";
import * as ui from "../../../../shared/ui";
import { questionService, type GeneratedQuestion } from "../../../quiz-editor/components/question-service";

type CompareMode = "original" | "dynamic";
type CompareCopy = {
  generateOriginal: string;
  generateQuestion: string;
  questionLabel: string;
  pdfTitle: string;
  loading: string;
  empty: string;
  pdfUnavailable: string;
  questionFailed: string;
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
  if (record.authoringMode === "reference")
    return questionService.generateReference(record, questions, sharedCode, original);
  if (record.advancedDynamic)
    return questionService.generateDynamic(record, original, sharedCode);
  return questionService.loadStatic(record);
}

export function QuizCompareTab({
  manifestPath,
  questions,
  sharedCode = "",
  copy,
}: {
  manifestPath: string;
  questions: ContestQuizQuestionRecord[];
  sharedCode?: string;
  copy: CompareCopy;
}) {
  const [previews, setPreviews] = useState<PreviewResult[] | null>(null);
  const [pendingModes, setPendingModes] = useState<Record<string, CompareMode | undefined>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const generationVersions = useRef(new Map<string, number>());
  const sortedQuestions = useMemo(
    () => [...questions].sort((left, right) => Number(left.question_no) - Number(right.question_no)),
    [questions],
  );

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
    generationVersions.current.clear();
    setPendingModes({});
    setPreviews(null);
    void Promise.all(sortedQuestions.map(async (record): Promise<PreviewResult> => {
      try {
        return { record, generated: await generateQuestion(record, sortedQuestions, sharedCode, "original") };
      } catch (cause) {
        return { record, error: cause instanceof Error ? cause.message : String(cause) };
      }
    })).then((result) => {
      if (active) setPreviews(result);
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
        <div className="quiz-compare-scroll-region">
          {!previews ? (
            <ui.PageLoading label={copy.loading} className="quiz-compare-loading" />
          ) : previews.length === 0 ? (
            <ui.PanelBody><p className="quiz-compare-empty">{copy.empty}</p></ui.PanelBody>
          ) : (
            <div className="quiz-compare-question-list">
              {previews.map((preview) => (
                <article className="quiz-compare-question" key={String(preview.record.question_no)}>
                  <header className="quiz-compare-question-header">
                    <span className="quiz-compare-question-title">
                      {copy.questionLabel.replace("{number}", String(preview.record.question_no))}
                    </span>
                    <span className="question-preview-actions">
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
    </div>
  );
}
