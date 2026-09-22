import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { Check } from "lucide-react";
import {
  formatAuthoringChoice,
  type RuntimeQuestion,
} from "../../features/quiz-editor/components/question-service";
import { displayQuestionValue } from "../../features/quiz-editor/domain/question-value-display";
import { MathText } from "./MathText";
import { localizedPreviewText } from "./question-preview-language";
import type { GenerationPerformance } from "../../features/quiz-editor/domain/generation-performance";

export type { RuntimeQuestion } from "../../features/quiz-editor/components/question-service";

export const questionText = displayQuestionValue;

function LocalizedPreviewText({
  textEn,
  textVn,
  supportedLanguages,
}: {
  textEn: unknown;
  textVn: unknown;
  supportedLanguages: Array<"en" | "vi">;
}) {
  const text = localizedPreviewText(textEn, textVn, supportedLanguages);
  if (!text.primary) return null;
  return (
    <>
      <p><MathText value={text.primary} /></p>
      {text.secondary && (
        <p className="question-preview-translation">
          <MathText value={text.secondary} />
        </p>
      )}
    </>
  );
}

export function PreviewAsset({
  manifestPath,
  value,
  alt,
}: {
  manifestPath: string;
  value: string;
  alt: string;
}) {
  const [source, setSource] = useState(
    value.startsWith("data:image/") ? value : "",
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const assetUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{
        manifestPath?: unknown;
        reference?: unknown;
        preview?: unknown;
      }>).detail;
      if (
        detail?.manifestPath === manifestPath &&
        detail.reference === value &&
        typeof detail.preview === "string"
      ) {
        setFailed(false);
        setSource(detail.preview);
      }
    };
    window.addEventListener("getgo:quiz-asset-updated", assetUpdated);
    setFailed(false);
    if (value.startsWith("data:image/")) {
      setSource(value);
      return () => {
        active = false;
        window.removeEventListener("getgo:quiz-asset-updated", assetUpdated);
      };
    }
    setSource("");
    void window.getgo
      .readQuizAsset(manifestPath, value)
      .then((result) => {
        if (active) setSource(result);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      window.removeEventListener("getgo:quiz-asset-updated", assetUpdated);
    };
  }, [manifestPath, value]);
  if (failed)
    return (
      <span className="question-preview-asset-error">
        Could not load {value}
      </span>
    );
  return source ? (
    <img src={source} alt={alt} />
  ) : (
    <span className="mini-spinner" aria-label={`Loading ${alt}`} />
  );
}

function PreviewValue({
  manifestPath,
  value,
  alt,
}: {
  manifestPath: string;
  value: unknown;
  alt: string;
}) {
  if (Array.isArray(value))
    return (
      <>
        {value.map((item, index) => (
          <PreviewValue
            key={index}
            manifestPath={manifestPath}
            value={item}
            alt={alt}
          />
        ))}
      </>
    );
  if (
    typeof value === "string" &&
    (value.startsWith("asset:") || value.startsWith("data:image/"))
  )
    return <PreviewAsset manifestPath={manifestPath} value={value} alt={alt} />;
  return <MathText value={questionText(value)} />;
}

function CorrectAnswerPreview({ value, unit }: { value: unknown; unit?: unknown }) {
  return (
    <div className="question-preview-correct-answer">
      <span>
        Correct answer: <strong>{questionText(value)}{unit ? ` ${String(unit)}` : ""}</strong>
      </span>
      <Check size={16} strokeWidth={2.5} aria-hidden="true" />
    </div>
  );
}

type QuestionPreviewProps = {
  question: RuntimeQuestion;
  params?: Record<string, unknown>;
  generationPerformance?: GenerationPerformance;
  manifestPath: string;
  supportedLanguages?: Array<"en" | "vi">;
};

class QuestionPreviewErrorBoundary extends Component<{
  children: ReactNode;
  supportedLanguages: Array<"en" | "vi">;
}, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[GetGo Tools][Question preview][render failed]", {
      error,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const showEnglish = this.props.supportedLanguages.includes("en");
    const showVietnamese = this.props.supportedLanguages.includes("vi");
    return (
      <div className="question-editor-errors" role="alert">
        <strong>
          {showEnglish ? "Preview could not be rendered" : "Không thể hiển thị bản xem trước"}
        </strong>
        {showEnglish && showVietnamese && <span>Không thể hiển thị bản xem trước</span>}
        <pre>{this.state.error.message}</pre>
      </div>
    );
  }
}

function QuestionPreviewContent({
  question,
  params,
  generationPerformance,
  manifestPath,
  supportedLanguages = ["en", "vi"],
}: QuestionPreviewProps) {
  const indexedPartText = (value: unknown, index: number) => {
    const text = questionText(value).replace(/^\s*(?:[a-z]|\d+)[.)]\s*/i, "");
    return text.trim() ? `${String.fromCharCode(97 + index)}. ${text}` : "";
  };
  const choices = Object.entries(question.answer?.choices ?? {});
  const inputParts = question.answer?.type === "multiple_input" && Array.isArray(question.answer?.inputs)
    ? question.answer.inputs as Array<Record<string, unknown>>
    : [];
  const correct = Array.isArray(question.answer?.correct)
    ? question.answer.correct.map(String)
    : [String(question.answer?.correct ?? "")];
  const isMultipleAnswer = question.answer?.type === "multiple_answer";
  const showEnglish = supportedLanguages.includes("en");
  const showVietnamese = supportedLanguages.includes("vi");
  const englishExplanation = questionText(question.explanation?.en);
  const vietnameseExplanation = questionText(question.explanation?.vi);
  const hasExplanation =
    (showEnglish && englishExplanation.trim().length > 0) ||
    (showVietnamese && vietnameseExplanation.trim().length > 0);
  return (
    <div className="question-preview">
      <div className="question-preview-content">
        <LocalizedPreviewText
          textEn={question.text_en}
          textVn={question.text_vn}
          supportedLanguages={supportedLanguages}
        />
        {question.image_datas?.map((image, index) => (
          <div
            className="question-preview-image"
            key={`${String(image)}-${index}`}
          >
            <PreviewValue
              manifestPath={manifestPath}
              value={image}
              alt={`Question illustration ${index + 1}`}
            />
          </div>
        ))}
        {inputParts.length ? (
          <div className="question-preview-multiple-inputs">
            {inputParts.map((part, index) => (
              <section className="question-preview-input-part" key={index}>
                <LocalizedPreviewText
                  textEn={indexedPartText(part.question_en, index)}
                  textVn={indexedPartText(part.question_vn, index)}
                  supportedLanguages={supportedLanguages}
                />
                <CorrectAnswerPreview value={correct[index] ?? ""} unit={part.unit} />
              </section>
            ))}
          </div>
        ) : isMultipleAnswer ? (
          <CorrectAnswerPreview value={correct.join("; ")} />
        ) : choices.length ? (
          <div className="question-preview-choices">
            {choices.map(([label, value]) => (
              <div
                className={correct.includes(label) ? "is-correct" : ""}
                key={label}
              >
                <b>{label}.</b>
                <span>
                  <PreviewValue
                    manifestPath={manifestPath}
                    value={label === question.answer.otherChoiceKey
                      ? value
                      : formatAuthoringChoice(question.answer, value)}
                    alt={`Choice ${label}`}
                  />
                  {question.answer.unit &&
                  label !== question.answer.otherChoiceKey
                    ? ` ${question.answer.unit}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <CorrectAnswerPreview value={question.answer?.correct} unit={question.answer?.unit} />
        )}
        {hasExplanation && (
          <section className="question-preview-explanation">
            <strong>Explanation</strong>
            {showEnglish && englishExplanation.trim() && (
              <div className="question-preview-explanation-text">
                <MathText value={englishExplanation} />
              </div>
            )}
            {showVietnamese && vietnameseExplanation.trim() && (
              <div className={showEnglish && englishExplanation.trim()
                ? "question-preview-explanation-text question-preview-translation"
                : "question-preview-explanation-text"}
              >
                <MathText value={vietnameseExplanation} />
              </div>
            )}
          </section>
        )}
      </div>
      {params && (
        <div className="question-preview-generation-meta">
          <div className="question-preview-params">
            <span>Generated parameters</span>
            <code>{JSON.stringify(params)}</code>
          </div>
          {generationPerformance && (
            <div className="question-preview-performance">
              <span>Generation time</span>
              <span>
                <code>{generationPerformance.durationMs} ms</code>
                <strong className={`is-${generationPerformance.speed}`}>
                  {generationPerformance.speed === "fast"
                    ? "Fast"
                    : generationPerformance.speed === "normal"
                      ? "Normal"
                      : "Slow"}
                </strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionPreview(props: QuestionPreviewProps) {
  const supportedLanguages = props.supportedLanguages ?? ["en", "vi"];
  return (
    <QuestionPreviewErrorBoundary
      key={`${String(props.question.question_no)}:${JSON.stringify(props.question.answer)}`}
      supportedLanguages={supportedLanguages}
    >
      <QuestionPreviewContent {...props} supportedLanguages={supportedLanguages} />
    </QuestionPreviewErrorBoundary>
  );
}
