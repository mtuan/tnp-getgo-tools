import { useEffect, useMemo, useRef, useState } from "react";
import { Zap } from "lucide-react";
import type { ContestQuizQuestionRecord } from "../../../shared/domain/models";
import { AccordionSection } from "../../../shared/ui/Accordion";
import { Button } from "../../../shared/ui/Button";
import { ErrorFrame } from "../../../shared/ui/ErrorFrame";
import { Form, type FormSchema } from "../../../shared/ui/Form";
import { QuestionPreview } from "../../../shared/ui/QuestionPreview";
import { questionService, type GeneratedQuestion } from "./question-service";

function prompt(record: ContestQuizQuestionRecord): string {
  const value = record.text_en ?? record.text_vn;
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  return text.trim() || "Untitled question";
}

export function ReferenceQuestionEditor({
  record,
  questions,
  manifestPath,
  quizSharedCode,
  onChange,
}: {
  record: ContestQuizQuestionRecord;
  questions: ContestQuizQuestionRecord[];
  manifestPath: string;
  quizSharedCode?: string;
  onChange(record: ContestQuizQuestionRecord): void;
}) {
  const [preview, setPreview] = useState<GeneratedQuestion | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceExpanded, setSourceExpanded] = useState(true);
  const [previewExpanded, setPreviewExpanded] = useState(true);
  const generationRef = useRef(0);
  const sourceNumber = record.authoringMode === "reference"
    ? record.reference?.questionNo
    : undefined;
  const byNumber = useMemo(
    () => new Map(questions.map((question) => [Number(question.question_no), question])),
    [questions],
  );
  const createsCycle = (candidate: number): boolean => {
    const visited = new Set<number>();
    let current = byNumber.get(candidate);
    while (current?.authoringMode === "reference") {
      const next = current.reference?.questionNo;
      if (next === Number(record.question_no)) return true;
      if (next == null || visited.has(next)) return false;
      visited.add(next);
      current = byNumber.get(next);
    }
    return false;
  };
  const options = questions
    .filter((question) => Number(question.question_no) !== Number(record.question_no))
    .filter((question) => !createsCycle(Number(question.question_no)))
    .sort((left, right) => Number(left.question_no) - Number(right.question_no))
    .map((question) => ({
      value: String(question.question_no),
      label: `Question ${question.question_no} · ${prompt(question)}`,
    }));
  const fields: FormSchema[] = [{
    name: "sourceQuestion",
    label: "Referenced question",
    helper: "This placeholder invokes the referenced question's generator independently each time.",
    type: "select",
    required: true,
    options,
  }];
  const generate = async (nextRecord = record) => {
    const generation = ++generationRef.current;
    if (nextRecord.authoringMode !== "reference" || !nextRecord.reference) {
      setPreview(null);
      setError(null);
      setGenerating(false);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const generated = await questionService.generateReference(
        nextRecord,
        questions,
        quizSharedCode,
      );
      if (generation === generationRef.current) setPreview(generated);
    } catch (cause) {
      if (generation !== generationRef.current) return;
      setPreview(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (generation === generationRef.current) setGenerating(false);
    }
  };

  useEffect(() => {
    void generate();
  }, [sourceNumber, record.question_no]);

  return (
    <div className="advanced-question-layout static-question-layout">
      <div className="advanced-question-editors">
        <AccordionSection
          className="static-question-form-panel"
          title="Question reference"
          description="Reuse another question without copying its code or parameters."
          expanded={sourceExpanded}
          onExpandedChange={setSourceExpanded}
        >
          <div className="static-question-fields">
            <Form
              fields={fields}
              values={{ sourceQuestion: sourceNumber == null ? "" : String(sourceNumber) }}
              autoSelectSingleOption={false}
              onChange={(_name, value) => {
                const questionNo = Number(value);
                if (!Number.isInteger(questionNo) || questionNo < 1) return;
                const next: ContestQuizQuestionRecord = {
                  ...record,
                  authoringMode: "reference",
                  reference: { questionNo },
                  advancedDynamic: undefined,
                  generatorBuild: undefined,
                };
                onChange(next);
              }}
            />
          </div>
        </AccordionSection>
      </div>
      <div className="advanced-question-sidebar">
        <AccordionSection
          className="question-preview-panel static-question-preview-accordion"
          title={`Question ${record.question_no}`}
          expanded={previewExpanded}
          onExpandedChange={setPreviewExpanded}
          actions={<Button
            variant="icon"
            title="Generate another instance"
            aria-label="Generate another instance"
            icon={<Zap size={16} />}
            loading={generating}
            disabled={!sourceNumber}
            onClick={() => void generate()}
          />}
        >
          {error ? <ErrorFrame message={error} /> : preview ? (
            <QuestionPreview
              question={preview.question}
              params={preview.params}
              manifestPath={manifestPath}
            />
          ) : <p className="muted">Select a question to preview a fresh generated instance.</p>}
        </AccordionSection>
      </div>
    </div>
  );
}
