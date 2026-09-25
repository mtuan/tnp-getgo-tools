import { useEffect, useRef, useState } from "react";
import { Check, Copy, History, RotateCcw, Zap } from "lucide-react";
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
  dynamicEditorModelEnvelope,
  formatDynamicCodeExpression,
  dynamicEditorValueFromModel,
  originParamsEditorSource,
  originParamsValueFromEditor,
  quizSharedEditorContext,
} from "../domain/question-dynamics";
import {
  generationErrorDetail,
  type GenerationErrorDetail,
} from "../domain/generation-error";
import {
  generationPerformance,
  type GenerationPerformance,
} from "../domain/generation-performance";
import { includeOriginalParameterSignatures } from "../domain/generator-signatures";
import { questionService } from "./question-service";
import { QuestionFeedback } from "./QuestionFeedback";
import * as ui from "../../../shared/ui";

type AdvancedDynamic = NonNullable<ContestQuizQuestionRecord["advancedDynamic"]>;

const SIGNATURE_PROBE_QUESTION = "({}) => {\n  return {} as never\n}";
const GENERATOR_RUNTIME_REVISION = "replace-digit-iterable-v1";

function generatorSourceKey(record: ContestQuizQuestionRecord): string {
  const dynamic = record.advancedDynamic;
  return [
    GENERATOR_RUNTIME_REVISION,
    dynamic?.paramsGeneratorTs ?? "",
    dynamic?.questionGeneratorTs ?? "",
    dynamic?.explanationGeneratorTs ?? "",
    dynamic?.originParamsTs ?? "",
  ].join("\u0000");
}

function recoveringSourceSections(
  source: string,
  dynamic: AdvancedDynamic,
) {
  try {
    return QuizTsService.getTemplateEditorSectionsRecovering(source);
  } catch {
    const fields = [
      ["params", dynamic.paramsGeneratorTs],
      ["question", dynamic.questionGeneratorTs],
      ["origin", dynamic.originParamsTs],
      ["explanation", dynamic.explanationGeneratorTs],
    ] as const;
    return fields.flatMap(([id, value]) => {
      const trimmed = value?.trim();
      if (!trimmed) return [];
      const firstLine = trimmed.split("\n", 1)[0];
      const offset = source.indexOf(firstLine);
      if (offset < 0) return [];
      const startLineNumber = source.slice(0, offset).split("\n").length;
      return [{
        id,
        startLineNumber,
        endLineNumber: startLineNumber + trimmed.split("\n").length - 1,
      }];
    });
  }
}

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
          originParamsTs: originParamsValueFromEditor(dynamic.originParamsTs),
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
          originParamsTs: originParamsValueFromEditor(dynamic.originParamsTs),
        }),
      ),
    );
    explanationGeneratorTs = synchronized.explanationGeneratorTs
      ?? dynamic.explanationGeneratorTs;
  } catch (cause) {
    failures.push({ field: "explanation", cause });
  }

  const withOriginalParameters = includeOriginalParameterSignatures({
    ...dynamic,
    questionGeneratorTs,
    explanationGeneratorTs,
  });
  return {
    dynamic: {
      ...dynamic,
      ...withOriginalParameters,
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
  const [errors, setErrors] = useState<GenerationErrorDetail[]>([]);
  const [errorSourceKey, setErrorSourceKey] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    question: RuntimeQuestion;
    params: Record<string, unknown>;
  }>(() => ({
    question: questionService.loadStatic(record).question,
    params: { __dynamic: true },
  }));
  const [previewPerformance, setPreviewPerformance] =
    useState<GenerationPerformance>();
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
  const [editorRepairRevision, setEditorRepairRevision] = useState(0);
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
    const latest = latestRecordRef.current;
    const dynamic = latest.advancedDynamic;
    if (!dynamic) return;
    const repaired = {
      ...dynamic,
      paramsGeneratorTs: dynamicEditorValueFromModel(dynamic.paramsGeneratorTs),
      questionGeneratorTs: dynamicEditorValueFromModel(dynamic.questionGeneratorTs),
      explanationGeneratorTs: dynamicEditorValueFromModel(dynamic.explanationGeneratorTs),
      originParamsTs: originParamsValueFromEditor(dynamicEditorValueFromModel(dynamic.originParamsTs)),
    };
    if (
      repaired.paramsGeneratorTs === dynamic.paramsGeneratorTs
      && repaired.questionGeneratorTs === dynamic.questionGeneratorTs
      && repaired.explanationGeneratorTs === dynamic.explanationGeneratorTs
      && repaired.originParamsTs === dynamic.originParamsTs
    ) return;
    const next = { ...latest, advancedDynamic: repaired };
    latestRecordRef.current = next;
    pendingDynamicChangeRef.current = true;
    setErrors([]);
    setErrorSourceKey(null);
    onChange(next);
  }, [onChange, path, record.advancedDynamic, record.question_no]);
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
    const persistedValue = key === "originParamsTs"
      ? value
      : dynamicEditorValueFromModel(value);
    const next = {
      ...latest,
      advancedDynamic: { ...latest.advancedDynamic!, [key]: persistedValue },
    };
    latestRecordRef.current = next;
    pendingDynamicChangeRef.current = true;
    // A generation error describes one exact source snapshot. Do not leave it
    // visible while the editor is already showing a newer generator.
    setErrors([]);
    setErrorSourceKey(null);
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
    const startedAt = performance.now();
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
      setPreviewPerformance(generationPerformance(performance.now() - startedAt));
      setErrors([]);
      setErrorSourceKey(null);
    } catch (cause) {
      console.error("[GetGo Tools][Question preview][generation failed]", {
        mode: original ? "original" : "random",
        questionNo: String(latestRecordRef.current.question_no),
        cause,
      });
      const latest = latestRecordRef.current;
      let sourceContext;
      if (latest.advancedDynamic) {
        const source = QuizTsService.composeTemplateSource(latest.advancedDynamic);
        try {
          sourceContext = {
            source,
            sections: recoveringSourceSections(source, latest.advancedDynamic),
          };
        } catch {
          /* Keep the original error when even structural recovery is impossible. */
        }
      }
      setErrors([generationErrorDetail(cause, sourceContext)]);
      setErrorSourceKey(generatorSourceKey(latestRecordRef.current));
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
  useEffect(() => {
    synchronizeDependentSignatures("parameter-source-change");
  }, [
    record.question_no,
    record.advancedDynamic?.paramsGeneratorTs,
    record.advancedDynamic?.originParamsTs,
  ]);
  const currentGeneratorSourceKey = generatorSourceKey(latestRecordRef.current);
  const currentErrors = errorSourceKey === currentGeneratorSourceKey ? errors : [];
  const editorFields = (
    [
      ["origin", "originParamsTs"],
      ["params", "paramsGeneratorTs"],
      ["question", "questionGeneratorTs"],
      ["explanation", "explanationGeneratorTs"],
    ] as const
  ).map(([id, key]) => {
    const storedValue = editorDynamic?.[key] ?? "";
    const normalizedValue = dynamicEditorValueFromModel(
      key === "explanationGeneratorTs" && !storedValue.trim()
        ? DEFAULT_EXPLANATION_GENERATOR_TS
        : storedValue,
    );
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
    const modelEnvelope = dynamicEditorModelEnvelope(
      id === "question" || id === "explanation"
        ? paramsGeneratorTs
        : undefined,
      id === "question" || id === "explanation"
        ? originParamsValueFromEditor(editorDynamic?.originParamsTs ?? "").trim()
        : undefined,
    );
    const extraLib = sharedContext
      ? {
          content: sharedContext,
          filePath: `file://${path.replaceAll("\\", "/")}.shared-context.ts`,
          replaceGroup: "active-quiz-shared-context",
        }
      : undefined;
    const hasLeakedEditorEnvelope = storedValue.includes(
      'const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;',
    );
    const repairedValue = key === "originParamsTs"
      ? originParamsValueFromEditor(storedValue)
      : dynamicEditorValueFromModel(storedValue);
    return {
      id,
      key,
      value,
      lineCount,
      editableLineRange,
      editableCode,
      extraLib,
      modelContext: modelEnvelope.prefix,
      modelContextSuffix: modelEnvelope.suffix,
      hasLeakedEditorEnvelope,
      repairedValue,
      onBlur: id === "params" || id === "origin"
        ? () => synchronizeDependentSignatures(`${id}-blur`)
        : undefined,
      onFocus: id === "params" || id === "origin"
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
            diagnostics={errors.map((error) => error.summary)}
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
                <span className="button-group">
                  <Button
                    variant="icon"
                    title={field.hasLeakedEditorEnvelope ? "Repair corrupted editor code" : "Reload editor from saved code"}
                    aria-label={`Repair ${panelCopy[field.id].title} code`}
                    icon={<RotateCcw size={16} />}
                    onClick={() => {
                        console.info("[GetGo Tools][Question editor][repair leaked envelope]", {
                          questionNo: String(latestRecordRef.current.question_no),
                          field: field.key,
                          beforeLength: latestRecordRef.current.advancedDynamic?.[field.key].length ?? 0,
                          afterLength: field.repairedValue.length,
                          beforePreview: latestRecordRef.current.advancedDynamic?.[field.key].slice(0, 240),
                          afterPreview: field.repairedValue.slice(0, 240),
                        });
                        updateField(field.key, field.repairedValue);
                        setEditorRepairRevision((current) => current + 1);
                        toast.show({
                          title: "Editor code repaired",
                          description: `${panelCopy[field.id].title} was restored.`,
                          variant: "success",
                        });
                    }}
                  />
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
                </span>
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
                  key={`${path}.${field.id}.${editorRepairRevision}`}
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
                  modelContext={field.modelContext}
                  modelContextSuffix={field.modelContextSuffix}
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
                              .map((marker) => {
                                const location = `${marker.startLineNumber}:${marker.startColumn}`;
                                return {
                                  summary: `TypeScript [TS${marker.code}] ${location} — ${marker.message}`,
                                  detail: [
                                    "Name: TypeScript diagnostic",
                                    `Code: TS${marker.code}`,
                                    `Location: ${location}`,
                                    `Message: ${marker.message}`,
                                  ].join("\n"),
                                };
                              }),
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
              generationPerformance={previewPerformance}
              manifestPath={manifestPath}
            />
            {currentErrors.length > 0 && (
              <div className="question-editor-errors">
                <strong>Type or generation error</strong>
                {currentErrors.map((error, index) => (
                  <span key={index} className="question-editor-error">
                    <span>{error.summary}</span>
                    <details open>
                      <summary>Error details</summary>
                      <pre>{error.detail}</pre>
                    </details>
                  </span>
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
