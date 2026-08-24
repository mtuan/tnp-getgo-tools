import { useEffect, useRef, useState } from "react";
import { Check, Copy, History, Zap } from "lucide-react";
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
import {
  DEFAULT_EXPLANATION_GENERATOR_TS,
  formatDynamicCodeExpression,
  originParamsEditorSource,
  originParamsValueFromEditor,
  quizSharedEditorContext,
} from "../domain/question-dynamics";
import { questionService } from "./question-service";
import { QuestionFeedback } from "./QuestionFeedback";
import * as ui from "../../../shared/ui";

type AdvancedDynamic = NonNullable<ContestQuizQuestionRecord["advancedDynamic"]>;

const SIGNATURE_PROBE_QUESTION = "({}) => {\n  return {} as never\n}";

function synchronizeGeneratorFields(dynamic: AdvancedDynamic): {
  dynamic: AdvancedDynamic;
  failures: Array<{ field: "question" | "explanation"; cause: unknown }>;
} {
  const failures: Array<{
    field: "question" | "explanation";
    cause: unknown;
  }> = [];
  let questionGeneratorTs = dynamic.questionGeneratorTs;
  let explanationGeneratorTs = dynamic.explanationGeneratorTs;

  try {
    const synchronized = QuizTsService.extractTemplateSourceFields(
      QuizTsService.syncQuestionGeneratorSignature(
        QuizTsService.composeTemplateSource({
          paramsGeneratorTs: dynamic.paramsGeneratorTs,
          questionGeneratorTs: dynamic.questionGeneratorTs,
          explanationGeneratorTs: DEFAULT_EXPLANATION_GENERATOR_TS,
          // Origin code is edited independently and may temporarily be invalid.
          originParamsTs: "{}",
        }),
      ),
    );
    questionGeneratorTs = synchronized.questionGeneratorTs;
  } catch (cause) {
    failures.push({ field: "question", cause });
  }

  try {
    const synchronized = QuizTsService.extractTemplateSourceFields(
      QuizTsService.syncQuestionGeneratorSignature(
        QuizTsService.composeTemplateSource({
          paramsGeneratorTs: dynamic.paramsGeneratorTs,
          questionGeneratorTs: SIGNATURE_PROBE_QUESTION,
          explanationGeneratorTs: dynamic.explanationGeneratorTs,
          // Origin code is edited independently and may temporarily be invalid.
          originParamsTs: "{}",
        }),
      ),
    );
    explanationGeneratorTs = synchronized.explanationGeneratorTs
      ?? dynamic.explanationGeneratorTs;
  } catch (cause) {
    failures.push({ field: "explanation", cause });
  }

  return {
    dynamic: {
      ...dynamic,
      questionGeneratorTs,
      explanationGeneratorTs,
    },
    failures,
  };
}

export function AdvancedQuestionEditor({
  record,
  path,
  manifestPath,
  context,
  quizSharedCode = "",
  onChange,
  onSave,
  onFeedbackSave,
}: {
  record: ContestQuizQuestionRecord;
  path: string;
  manifestPath: string;
  context: Record<string, unknown>;
  quizSharedCode?: string;
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
  const latestRecordRef = useRef(record);
  const pendingDynamicChangeRef = useRef(false);
  const latestRecord = latestRecordRef.current;
  if (String(latestRecord.question_no) !== String(record.question_no)) {
    latestRecordRef.current = record;
    pendingDynamicChangeRef.current = false;
  } else if (
    !pendingDynamicChangeRef.current ||
    JSON.stringify(latestRecord.advancedDynamic) ===
      JSON.stringify(record.advancedDynamic)
  ) {
    latestRecordRef.current = record;
    pendingDynamicChangeRef.current = false;
  }
  const [aiHistoryOpen, setAiHistoryOpen] = useState(false);
  const [copiedPanel, setCopiedPanel] = useState<string | null>(null);
  const toast = ui.useToast();
  const [expandedCodePanels, setExpandedCodePanels] = useState<Set<string>>(
    () => new Set(["params", "question", "explanation", "origin"]),
  );
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
  useEffect(() => {
    console.info("[GetGo Tools][Question preview][committed]", {
      questionNo: String(preview.question.question_no),
      textEn: preview.question.text_en,
      answer: preview.question.answer,
      params: preview.params,
    });
  }, [preview]);
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
    pendingDynamicChangeRef.current = true;
    onChange(next);
  };
  const synchronizeDependentSignatures = (trigger = "unknown") => {
    const latest = latestRecordRef.current;
    if (String(latest.question_no) !== String(record.question_no)) {
      console.info("[GetGo Tools][Question signatures][skipped]", {
        trigger,
        reason: "question-changed",
        latestQuestionNo: String(latest.question_no),
        renderedQuestionNo: String(record.question_no),
      });
      return;
    }
    if (!latest.advancedDynamic) {
      console.info("[GetGo Tools][Question signatures][skipped]", {
        trigger,
        reason: "no-dynamic-code",
        questionNo: String(latest.question_no),
      });
      return;
    }
    const beforeQuestionSignature = latest.advancedDynamic.questionGeneratorTs
      .split("\n", 1)[0];
    const beforeExplanationSignature = latest.advancedDynamic.explanationGeneratorTs
      .split("\n", 1)[0];
    console.info("[GetGo Tools][Question signatures][sync started]", {
      trigger,
      questionNo: String(latest.question_no),
      paramsLength: latest.advancedDynamic.paramsGeneratorTs.length,
      paramsPreview: latest.advancedDynamic.paramsGeneratorTs.slice(0, 240),
      beforeQuestionSignature,
      beforeExplanationSignature,
    });
    try {
      const synchronized = synchronizeGeneratorFields(latest.advancedDynamic);
      for (const failure of synchronized.failures) {
        console.warn("[GetGo Tools][Question signatures][field failed]", {
          trigger,
          questionNo: String(latest.question_no),
          field: failure.field,
          cause: failure.cause,
        });
      }
      const { questionGeneratorTs, explanationGeneratorTs } = synchronized.dynamic;
      if (
        questionGeneratorTs === latest.advancedDynamic.questionGeneratorTs &&
        explanationGeneratorTs === latest.advancedDynamic.explanationGeneratorTs
      ) {
        console.info("[GetGo Tools][Question signatures][unchanged]", {
          trigger,
          questionNo: String(latest.question_no),
          beforeQuestionSignature,
          beforeExplanationSignature,
          failedFields: synchronized.failures.map((failure) => failure.field),
        });
        return;
      }
      const next = {
        ...latest,
        advancedDynamic: {
          ...latest.advancedDynamic,
          questionGeneratorTs,
          explanationGeneratorTs,
        },
      };
      latestRecordRef.current = next;
      pendingDynamicChangeRef.current = true;
      console.info("[GetGo Tools][Question signatures][updated]", {
        trigger,
        questionNo: String(latest.question_no),
        afterQuestionSignature: questionGeneratorTs.split("\n", 1)[0],
        afterExplanationSignature: explanationGeneratorTs.split("\n", 1)[0],
      });
      onChange(next);
    } catch (cause) {
      console.warn("[GetGo Tools][Question signatures][failed]", {
        trigger,
        questionNo: String(latest.question_no),
        cause,
      });
      /* Incomplete TypeScript is normal while typing; the next edit or blur retries. */
    }
  };
  const generate = async (original = false) => {
    try {
      console.info("[GetGo Tools][Question preview][generation requested]", {
        mode: original ? "original" : "random",
        questionNo: String(latestRecordRef.current.question_no),
        currentPreview: {
          textEn: preview.question.text_en,
          answer: preview.question.answer,
          params: preview.params,
        },
      });
      const generated = await questionService.generateDynamic(
        latestRecordRef.current,
        original,
        quizSharedCode,
      );
      console.info("[GetGo Tools][Question preview][generation returned]", {
        mode: original ? "original" : "random",
        questionNo: String(generated.question.question_no),
        generatedQuestion: generated.question,
        generatedParams: generated.params ?? {},
      });
      setPreview({
        question: generated.question,
        params: generated.params ?? {},
      });
      setErrors([]);
    } catch (cause) {
      console.error("[GetGo Tools][Question preview][generation failed]", {
        mode: original ? "original" : "random",
        questionNo: String(latestRecordRef.current.question_no),
        cause,
      });
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
  // Local Monaco edits reach the draft ref synchronously. Use that source while
  // the parent draft update is rendering so focus transitions never rebuild the
  // dependent editors from the previous parameter signature.
  const editorDynamic = latestRecordRef.current.advancedDynamic;
  const editorFields = (
    [
      ["origin", "originParamsTs"],
      ["params", "paramsGeneratorTs"],
      ["question", "questionGeneratorTs"],
      ["explanation", "explanationGeneratorTs"],
    ] as const
  ).map(([id, key]) => {
    const storedValue = editorDynamic?.[key] ?? "";
    const normalizedValue =
      key === "explanationGeneratorTs" && !storedValue.trim()
        ? DEFAULT_EXPLANATION_GENERATOR_TS
        : storedValue;
    const value = key === "originParamsTs"
      ? originParamsEditorSource(normalizedValue)
      : normalizedValue;
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
            : DEFAULT_EXPLANATION_GENERATOR_TS,
        originParamsTs: key === "originParamsTs" ? value : "{}",
      });
      section = QuizTsService.getTemplateEditorSections(isolatedSource).find(
        (item) => item.id === id,
      );
    } catch {
      /* An invalid field must not affect any other editor. */
    }
    const lineCount = Math.max(1, value.split("\n").length);
    const sectionEditableLineRange =
      section?.editableStartLineNumber != null &&
      section.editableEndLineNumber != null
        ? {
            startLineNumber:
              section.editableStartLineNumber - section.startLineNumber + 1,
            endLineNumber:
              section.editableEndLineNumber - section.startLineNumber + 1,
          }
        : undefined;
    const editableLineRange = id === "origin" && lineCount > 2
      ? { startLineNumber: 2, endLineNumber: lineCount - 1 }
      : sectionEditableLineRange;
    const editableCode = editableLineRange
      ? value
          .split("\n")
          .slice(
            editableLineRange.startLineNumber - 1,
            editableLineRange.endLineNumber,
          )
          .join("\n")
      : value;
    const sharedContext = quizSharedEditorContext(quizSharedCode);
    const paramsGeneratorTs = editorDynamic?.paramsGeneratorTs.trim();
    const parameterContext = paramsGeneratorTs
      ? `${sharedContext ? "" : "export {};\n"}const __getgoParamsGeneratorForEditor = (${paramsGeneratorTs});\ndeclare global {\n  type __GetGoParams = ReturnType<typeof __getgoParamsGeneratorForEditor>;\n}\n`
      : "";
    const editorContext = `${sharedContext}${parameterContext}`;
    const extraLib = editorContext
      ? {
          content: editorContext,
          // A fresh URI forces Monaco to recompute ReturnType inference. The
          // replacement group removes the previous question's global alias so
          // its __GetGoParams declaration cannot leak across navigation.
          filePath: `file://${path.replaceAll("\\", "/")}.editor-context.ts`,
          replaceGroup: "active-question-context",
        }
      : undefined;
    return {
      id,
      key,
      value,
      lineCount,
      editableLineRange,
      editableCode,
      extraLib,
      onBlur: id === "params"
        ? () => synchronizeDependentSignatures("params-blur")
        : undefined,
      onFocus: id === "params"
        ? undefined
        : () => synchronizeDependentSignatures(`${id}-monaco-focus`),
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
            <ui.AccordionSection
              className="advanced-question-editor-panel"
              title={panelCopy[field.id].title}
              description={panelCopy[field.id].description}
              key={field.id}
              actionsAlwaysVisible
              actions={
                <Button
                  variant="icon"
                  title={copiedPanel === field.id ? "Copied" : "Copy editable code"}
                  aria-label={copiedPanel === field.id ? "Editable code copied" : `Copy ${panelCopy[field.id].title} editable code`}
                  icon={copiedPanel === field.id ? <Check size={16} /> : <Copy size={16} />}
                  onClick={() => {
                    void window.getgo.copyText(field.editableCode).then(() => {
                      setCopiedPanel(field.id);
                      window.setTimeout(
                        () => setCopiedPanel((current) => current === field.id ? null : current),
                        1400,
                      );
                    }).catch((cause: unknown) => {
                      toast.show({
                        title: "Could not copy code",
                        description: cause instanceof Error ? cause.message : String(cause),
                        variant: "error",
                      });
                    });
                  }}
                />
              }
              expanded={expandedCodePanels.has(field.id)}
              onExpandedChange={(expanded) =>
                setExpandedCodePanels((current) => {
                  const next = new Set(current);
                  if (expanded) next.add(field.id);
                  else next.delete(field.id);
                  return next;
                })
              }
            >
              <div
                className="question-code-workspace"
                onFocusCapture={field.id === "params"
                  ? undefined
                  : () => synchronizeDependentSignatures(`${field.id}-dom-focus`)}
              >
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
                  extraLib={field.extraLib}
                  relativeLineNumbers
                  formatOnMount={formatDynamicCodeExpression}
                  onChange={(value) => updateField(
                    field.key,
                    field.id === "origin"
                      ? originParamsValueFromEditor(value)
                      : value,
                  )}
                  onBlur={field.onBlur}
                  onFocus={field.onFocus}
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
            </ui.AccordionSection>
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
