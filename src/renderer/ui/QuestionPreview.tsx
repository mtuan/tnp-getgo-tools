import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { RuntimeQuestion } from "../question-service";
import { displayQuestionValue } from "../../core/question-value-display";

export type { RuntimeQuestion } from "../question-service";

export const questionText = displayQuestionValue;

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
  return <>{questionText(value)}</>;
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

export function QuestionPreview({
  question,
  params,
  manifestPath,
}: {
  question: RuntimeQuestion;
  params?: Record<string, unknown>;
  manifestPath: string;
}) {
  const indexedPartText = (value: unknown, index: number) => {
    const text = questionText(value).replace(/^\s*(?:[a-z]|\d+)[.)]\s*/i, "");
    return `${String.fromCharCode(97 + index)}. ${text}`;
  };
  const choices = Object.entries(question.answer?.choices ?? {});
  const inputParts = question.answer?.type === "multiple_input" && Array.isArray(question.answer?.inputs)
    ? question.answer.inputs as Array<Record<string, unknown>>
    : [];
  const correct = Array.isArray(question.answer?.correct)
    ? question.answer.correct.map(String)
    : [String(question.answer?.correct ?? "")];
  const englishText = questionText(question.text_en);
  const vietnameseText = questionText(question.text_vn);
  const englishExplanation = questionText(question.explanation?.en);
  const vietnameseExplanation = questionText(question.explanation?.vi);
  const hasExplanation =
    englishExplanation.trim().length > 0 ||
    vietnameseExplanation.trim().length > 0;
  return (
    <div className="question-preview">
      <div className="question-preview-content">
        {englishText.trim() && <p>{englishText}</p>}
        {vietnameseText.trim() && (
          <p className="question-preview-translation">{vietnameseText}</p>
        )}
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
                <p>{indexedPartText(part.question_en, index)}</p>
                {questionText(part.question_vn).trim() && (
                  <p className="question-preview-translation">
                    {indexedPartText(part.question_vn, index)}
                  </p>
                )}
                <CorrectAnswerPreview value={correct[index] ?? ""} unit={part.unit} />
              </section>
            ))}
          </div>
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
                    value={value}
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
            {englishExplanation.trim() && <p>{englishExplanation}</p>}
            {vietnameseExplanation.trim() && (
              <p className="question-preview-translation">
                {vietnameseExplanation}
              </p>
            )}
          </section>
        )}
      </div>
      {params && (
        <div className="question-preview-params">
          <span>Generated parameters</span>
          <code>{JSON.stringify(params)}</code>
        </div>
      )}
    </div>
  );
}
