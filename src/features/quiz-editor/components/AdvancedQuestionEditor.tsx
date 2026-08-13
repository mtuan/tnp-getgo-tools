import { useEffect, useRef, useState } from "react";
import { History, Zap } from "lucide-react";
import { QuizTsService } from "@tnp/getgo-logics/authoring";
import type {
  ContestQuizQuestionRecord,
  QuestionFeedback as Feedback,
} from "../../../shared/domain/models";
import { QuizCodeEditor } from "./QuizCodeEditor";
import { AiHistoryDrawer } from "./AiHistoryDrawer";
import { DynamicQuestionAi } from "./DynamicQuestionAi";
import { Button } from "../../../shared/ui/Button";
import { Panel } from "../../../shared/ui/Panel";
import {
  QuestionPreview,
  questionText as text,
  type RuntimeQuestion,
} from "../../../shared/ui/QuestionPreview";
import { questionService } from "./question-service";
import { QuestionFeedback } from "./QuestionFeedback";

export function AdvancedQuestionEditor({
  record,
  path,
  manifestPath,
  context,
  onChange,
  onSave,
  onFeedbackSave,
}: {
  record: ContestQuizQuestionRecord;
  path: string;
  manifestPath: string;
  context: Record<string, unknown>;
  onChange(record: ContestQuizQuestionRecord): void;
  onSave(): void;
  onFeedbackSave(value: Omit<Feedback, "updatedAt"> | null): Promise<void>;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<{
    question: RuntimeQuestion;
    params: Record<string, unknown>;
  }>(() => ({
    question: questionService.loadStatic(record).question,
    params: { __dynamic: true },
  }));
  const generatedQuestionRef = useRef<string | number | null>(null);
  const signatureSourceRef = useRef({
    questionNo: String(record.question_no),
    paramsGeneratorTs: record.advancedDynamic?.paramsGeneratorTs ?? "",
  });
  const latestRecordRef = useRef(record);
  latestRecordRef.current = record;
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  useEffect(() => {
    console.info("[GetGo Tools][Question editor][bound draft]", {
      questionNo: String(record.question_no),
      path,
      generatorLengths: {
        params: record.advancedDynamic?.paramsGeneratorTs.length ?? 0,
        question: record.advancedDynamic?.questionGeneratorTs.length ?? 0,
        explanation: record.advancedDynamic?.explanationGeneratorTs.length ?? 0,
        origin: record.advancedDynamic?.originParamsTs.length ?? 0,
      },
    });
  }, [path, record.question_no]);
  const updateField = (
    key:
      | "paramsGeneratorTs"
      | "questionGeneratorTs"
      | "explanationGeneratorTs"
      | "originParamsTs",
    value: string,
  ) => {
    const latest = latestRecordRef.current;
    const next = {
      ...latest,
      advancedDynamic: { ...latest.advancedDynamic!, [key]: value },
    };
    latestRecordRef.current = next;
    onChange(next);
  };
  const synchronizeDependentSignatures = () => {
    const latest = latestRecordRef.current;
    if (String(latest.question_no) !== String(record.question_no)) return;
    if (!latest.advancedDynamic) return;
    try {
      const currentSource = QuizTsService.composeTemplateSource(
        latest.advancedDynamic,
      );
      const synchronizedSource =
        QuizTsService.syncQuestionGeneratorSignature(currentSource);
      if (synchronizedSource === currentSource) return;
      const fields =
        QuizTsService.extractTemplateSourceFields(synchronizedSource);
      const questionGeneratorTs = fields.questionGeneratorTs;
      const explanationGeneratorTs =
        fields.explanationGeneratorTs ??
        latest.advancedDynamic.explanationGeneratorTs;
      if (
        questionGeneratorTs === latest.advancedDynamic.questionGeneratorTs &&
        explanationGeneratorTs === latest.advancedDynamic.explanationGeneratorTs
      )
        return;
      onChange({
        ...latest,
        advancedDynamic: {
          ...latest.advancedDynamic,
          questionGeneratorTs,
          explanationGeneratorTs,
        },
      });
    } catch {
      /* Incomplete TypeScript is normal while typing; the next edit or blur retries. */
    }
  };
  useEffect(() => {
    const next = {
      questionNo: String(record.question_no),
      paramsGeneratorTs: record.advancedDynamic?.paramsGeneratorTs ?? "",
    };
    const previous = signatureSourceRef.current;
    signatureSourceRef.current = next;
    if (
      previous.questionNo !== next.questionNo ||
      previous.paramsGeneratorTs === next.paramsGeneratorTs
    )
      return;
    const timeout = window.setTimeout(synchronizeDependentSignatures, 400);
    return () => window.clearTimeout(timeout);
  }, [record.advancedDynamic?.paramsGeneratorTs, record.question_no]);
  const generate = async (original = false) => {
    try {
      const generated = await questionService.generateDynamic(
        latestRecordRef.current,
        original,
      );
      setPreview({
        question: generated.question,
        params: generated.params ?? {},
      });
      setErrors([]);
    } catch (cause) {
      setErrors([cause instanceof Error ? cause.message : String(cause)]);
    }
  };
  useEffect(() => {
    if (generatedQuestionRef.current === record.question_no) return;
    generatedQuestionRef.current = record.question_no;
    void generate();
  }, [record.question_no]);
  const panelCopy = {
    params: {
      title: "Parameters generator",
      description: "Generate randomized values used by the question.",
    },
    question: {
      title: "Question generator",
      description:
        "Build the localized question and answer from generated parameters.",
    },
    explanation: {
      title: "Explanation generator",
      description: "Explain the generated answer in English and Vietnamese.",
    },
    origin: {
      title: "Original parameters",
      description:
        "Validate the template using the source question's original values.",
    },
  };
  const editorFields = (
    [
      ["params", "paramsGeneratorTs"],
      ["question", "questionGeneratorTs"],
      ["explanation", "explanationGeneratorTs"],
      ["origin", "originParamsTs"],
    ] as const
  ).map(([id, key]) => {
    const value = record.advancedDynamic?.[key] ?? "";
    let section;
    try {
      const isolatedSource = QuizTsService.composeTemplateSource({
        paramsGeneratorTs:
          key === "paramsGeneratorTs" ? value : "() => {\n  return {}\n}",
        questionGeneratorTs:
          key === "questionGeneratorTs"
            ? value
            : "({}) => {\n  return {} as never\n}",
        explanationGeneratorTs:
          key === "explanationGeneratorTs"
            ? value
            : "({}) => {\n  return { en: '', vi: '' }\n}",
        originParamsTs: key === "originParamsTs" ? value : "{}",
      });
      section = QuizTsService.getTemplateEditorSections(isolatedSource).find(
        (item) => item.id === id,
      );
    } catch {
      /* An invalid field must not affect any other editor. */
    }
    const lineCount = Math.max(1, value.split("\n").length);
    const editableLineRange =
      section?.editableStartLineNumber != null &&
      section.editableEndLineNumber != null
        ? {
            startLineNumber:
              section.editableStartLineNumber - section.startLineNumber + 1,
            endLineNumber:
              section.editableEndLineNumber - section.startLineNumber + 1,
          }
        : undefined;
    const usesGeneratedParams = id === "question" || id === "explanation";
    const modelContext = usesGeneratedParams
      ? {
          prefix: `export {}\nconst __getgoParamsGenerator = ${record.advancedDynamic?.paramsGeneratorTs ?? "() => ({})"}\ntype __GetGoParams = ReturnType<typeof __getgoParamsGenerator>\nconst __getgoCallback: (params: __GetGoParams) => unknown =\n`,
          suffix: "\n",
        }
      : undefined;
    return {
      id,
      key,
      value,
      lineCount,
      editableLineRange,
      expressionContext: id === "origin",
      modelContext,
      onBlur: id === "params" ? synchronizeDependentSignatures : undefined,
    };
  });
  return (
    <>
      <div className="advanced-question-layout">
        <div className="advanced-question-editors">
          <DynamicQuestionAi
            record={record}
            context={context}
            diagnostics={errors}
            hasGeneratedExplanation={Boolean(
              text(preview.question.explanation?.en).trim() ||
              text(preview.question.explanation?.vi).trim(),
            )}
            onApply={onChange}
            onHistoryOpen={() => setAiHistoryOpen(true)}
          />
          {editorFields.map((field) => (
            <Panel
              className="advanced-question-editor-panel"
              title={panelCopy[field.id].title}
              description={panelCopy[field.id].description}
              key={field.id}
            >
              <div className="question-code-workspace">
                <QuizCodeEditor
                  key={`${path}.${field.id}`}
                  value={field.value}
                  path={`${path}.${field.id}.ts`}
                  autoHeight
                  minHeight={120}
                  visibleLineRange={{
                    startLineNumber: 1,
                    endLineNumber: field.lineCount,
                  }}
                  editableLineRange={field.editableLineRange}
                  expressionContext={field.expressionContext}
                  modelContext={field.modelContext}
                  relativeLineNumbers
                  onChange={(value) => updateField(field.key, value)}
                  onBlur={field.onBlur}
                  onSave={onSave}
                  onValidate={
                    field.id === "question"
                      ? (markers) =>
                          setErrors(
                            markers
                              .filter((marker) => marker.severity === 8)
                              .map(
                                (marker) =>
                                  `${marker.startLineNumber}:${marker.startColumn} — ${marker.message}`,
                              ),
                          )
                      : undefined
                  }
                />
              </div>
            </Panel>
          ))}
        </div>
        <div className="advanced-question-sidebar">
          <Panel
            className="question-preview-panel"
            title={`Question ${preview.question.question_no}`}
            meta={
              <span className="question-preview-actions">
                <QuestionFeedback
                  feedback={record.feedback}
                  onSave={onFeedbackSave}
                />
                <Button
                  variant="icon"
                  title="Regenerate question"
                  aria-label="Regenerate question"
                  icon={<Zap size={16} />}
                  onClick={() => void generate()}
                />
                <Button
                  variant="icon"
                  title="Generate original question"
                  aria-label="Generate original question"
                  icon={<History size={16} />}
                  onClick={() => void generate(true)}
                />
              </span>
            }
          >
            <QuestionPreview
              question={preview.question}
              params={preview.params}
              manifestPath={manifestPath}
            />
            {errors.length > 0 && (
              <div className="question-editor-errors">
                <strong>Type or generation error</strong>
                {errors.map((error, index) => (
                  <span key={index}>{error}</span>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
      {aiHistoryOpen && record.aiResponse && (
        <AiHistoryDrawer
          record={record}
          onClose={() => setAiHistoryOpen(false)}
        />
      )}
    </>
  );
}
