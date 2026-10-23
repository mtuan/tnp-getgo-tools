import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, History, Sparkles, Wrench, X } from "lucide-react";
import {
  QuizTsService,
  createDynamicQuestionBuildService,
} from "@tnp/getgo-logics/authoring";
import {
  QuizBuilder,
  QuizValueSerializer,
} from "@tnp/getgo-logics/quiz-builder";
import type {
  AppSettings,
  ContestQuizQuestionRecord,
  DynamicQuestionProposalResult,
} from "../../../shared/domain/models";
import { withQuestionStatus } from "../../../features/quiz-editor/domain/question-status";
import type { RuntimeQuestion } from "../../../shared/ui/QuestionPreview";
import { useToast } from "../../../shared/ui/Toast";
import * as ui from "../../../shared/ui";
import en from "../../../shared/localization/en.json";
import vi from "../../../shared/localization/vi.json";

const sourceKeys = [
  "paramsGeneratorTs",
  "questionGeneratorTs",
  "explanationGeneratorTs",
  "originParamsTs",
] as const;
const sha256 = async (source: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
const builder = createDynamicQuestionBuildService({
  createBuilder: () => new QuizBuilder(),
  serialize: (value) => QuizValueSerializer.serialize(value),
  deserialize: (value) => QuizValueSerializer.deserialize(value),
  hash: sha256,
});
const elapsedLabel = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const hasExplanationContent = (value: unknown): boolean => {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasExplanationContent);
  if (value && typeof value === "object")
    return Object.values(value).some(hasExplanationContent);
  return false;
};
const protectedQuestionFields = [
  "question_no",
  "category",
  "text_en",
  "text_vn",
  "image_datas",
  "answer",
] as const;
const protectedQuestionContent = (question: Record<string, unknown>) =>
  Object.fromEntries(
    protectedQuestionFields
      .filter((key) => question[key] !== undefined)
      .map((key) => [key, question[key]]),
  );
const comparableProtectedValue = (
  key: (typeof protectedQuestionFields)[number],
  value: unknown,
) => {
  if (
    key === "text_vn" &&
    (value === undefined || value === null || value === "")
  )
    return undefined;
  if (
    key === "image_datas" &&
    (value === undefined || (Array.isArray(value) && value.length === 0))
  )
    return undefined;
  return value;
};
const changedProtectedFields = (
  original: Record<string, unknown>,
  generated: Record<string, unknown>,
) =>
  protectedQuestionFields.filter(
    (key) =>
      JSON.stringify(comparableProtectedValue(key, original[key])) !==
      JSON.stringify(comparableProtectedValue(key, generated[key])),
  );
const displayProtectedValue = (value: unknown) =>
  value === undefined ? "—" : JSON.stringify(value, null, 2);
const requestsRegeneration = (instructions: string) =>
  /^\s*(?:please\s+)?(?:regenerate\b|generate\s+(?:it\s+)?again\b|recreate\b|start\s+(?:over|again)\b|tạo\s+lại\b|tạo\s+mới\b)/i.test(
    instructions,
  );
class ProtectedQuestionConflict extends Error {}
const proposalSummary = (
  proposal: Partial<DynamicQuestionProposalResult["proposal"]>,
) => ({
  parameterizedValues: Array.isArray(proposal.parameterizedValues)
    ? proposal.parameterizedValues
    : [],
  explanation:
    typeof proposal.explanation === "string"
      ? proposal.explanation
      : "Existing generated question code.",
  assumptions: Array.isArray(proposal.assumptions) ? proposal.assumptions : [],
  warnings: Array.isArray(proposal.warnings) ? proposal.warnings : [],
  confidence: typeof proposal.confidence === "number" ? proposal.confidence : 1,
});

export function DynamicQuestionAi({
  record,
  context,
  locale,
  manifestPath,
  supportedLanguages,
  diagnostics,
  hasGeneratedExplanation = false,
  onApply,
  onHistoryOpen,
}: {
  record: ContestQuizQuestionRecord;
  context: Record<string, unknown>;
  locale: AppSettings["locale"];
  manifestPath: string;
  supportedLanguages: Array<"en" | "vi">;
  diagnostics: string[];
  hasGeneratedExplanation?: boolean;
  onApply(record: ContestQuizQuestionRecord): void;
  onHistoryOpen(): void;
}) {
  const toast = useToast();
  const previewCopy = (locale === "vi" ? vi : en).aiFixPreview;
  const mode =
    record.aiResponse ||
    (Array.isArray(record.aiFixHistory) && record.aiFixHistory.length > 0) ||
    hasExplanationContent(record.explanation) ||
    hasGeneratedExplanation
      ? "fix"
      : "generate";
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [rejectedFix, setRejectedFix] = useState<{
    question: RuntimeQuestion;
    changedFields: string[];
    original: Record<string, unknown>;
    generated: Record<string, unknown>;
    candidate: ContestQuizQuestionRecord;
  } | null>(null);
  const regenerationIntent =
    mode === "fix" && requestsRegeneration(instructions);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const requestVersion = useRef(0);
  useEffect(
    () => () => {
      requestVersion.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      250,
    );
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const input = instructionsRef.current;
    if (!input) return;
    input.style.height = "auto";
    const contentHeight = input.scrollHeight;
    input.style.height = `${Math.min(contentHeight, 76)}px`;
    input.style.overflowY = contentHeight > 76 ? "auto" : "hidden";
  }, [instructions]);
  async function formatSource(
    key: (typeof sourceKeys)[number],
    source: string,
  ) {
    try {
      const formatted = (
        await QuizTsService.formatSnippet(
          key === "originParamsTs" ? `(${source})` : source,
        )
      )
        .trim()
        .replace(/^;\s*/, "");
      return key === "originParamsTs"
        ? formatted.replace(/^\(\s*/, "").replace(/\s*\)$/, "")
        : formatted;
    } catch {
      return source.trim();
    }
  }
  async function applyGenerated(
    result: DynamicQuestionProposalResult,
    startedAt: number,
    version: number,
    resetFixHistory = false,
  ) {
    const fields = Object.fromEntries(
      await Promise.all(
        sourceKeys.map(async (key) => [
          key,
          await formatSource(key, String(result.proposal[key] ?? "")),
        ]),
      ),
    );
    if (version !== requestVersion.current) return;
    const generatedDynamic = fields as NonNullable<
      ContestQuizQuestionRecord["advancedDynamic"]
    >;
    const candidate = withQuestionStatus(
      {
        ...record,
        authoringMode: "advanced-dynamic",
        advancedDynamic: generatedDynamic,
        aiResponse: {
          ...result,
          generatedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startedAt,
        },
        ...(resetFixHistory ? { aiFixHistory: [] } : {}),
      },
      "pending",
    );
    if (!resetFixHistory) {
      const originResult = await builder.generateOriginal(
        QuizTsService.composeTemplateSource(generatedDynamic),
      );
      if (!originResult)
        throw new Error(
          "AI generation could not reproduce the static question from its origin parameters.",
        );
      const originalContent = protectedQuestionContent(record);
      const generatedContent = protectedQuestionContent(
        originResult.question as unknown as Record<string, unknown>,
      );
      const contentChanges = changedProtectedFields(
        originalContent,
        generatedContent,
      );
      if (contentChanges.length) {
        setRejectedFix({
          question: originResult.question as RuntimeQuestion,
          changedFields: contentChanges,
          original: originalContent,
          generated: generatedContent,
          candidate,
        });
        throw new ProtectedQuestionConflict(
          `AI generation changed protected question content (${contentChanges.join(", ")}). Nothing was applied.`,
        );
      }
    }
    if (version !== requestVersion.current) return;
    onApply(candidate);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "fix" && !instructions.trim()) {
      toast.show({
        title: "Fix instructions required",
        description: "Describe what the AI should repair.",
        variant: "error",
      });
      return;
    }
    const version = ++requestVersion.current;
    const startedAt = Date.now();
    const regenerate = regenerationIntent;
    setRejectedFix(null);
    setBusy(true);
    try {
      if (mode === "generate" || regenerate) {
        const result = await window.getgo.createDynamicQuestionProposalWithCodex({
          question: record,
          context,
          instructions: instructions.trim() || undefined,
        });
        if (version !== requestVersion.current) return;
        await applyGenerated(result, startedAt, version, regenerate);
        if (version !== requestVersion.current) return;
        toast.show({
          title: regenerate ? "Question regenerated" : "AI proposal applied",
          description:
            result.proposal.warnings[0] ?? result.proposal.explanation,
        });
      } else {
        const history = Array.isArray(record.aiFixHistory)
          ? record.aiFixHistory
          : [];
        const currentProposal = history.at(-1)?.proposal ??
          record.aiResponse?.proposal ?? {
            ...record.advancedDynamic!,
            parameterizedValues: [],
            explanation: "Existing generated question code.",
            assumptions: [],
            warnings: [],
            confidence: 1,
          };
        const currentSummary = proposalSummary(currentProposal);
        const result = await window.getgo.fixDynamicQuestion({
          originalQuestion: record,
          currentCode: record.advancedDynamic!,
          currentSummary,
          context,
          diagnostics,
          instructions: instructions.trim(),
        });
        if (version !== requestVersion.current) return;
        const changed = Object.fromEntries(
          await Promise.all(
            result.changes.map(async (change) => [
              change.field,
              await formatSource(change.field, change.source),
            ]),
          ),
        );
        if (version !== requestVersion.current) return;
        const advancedDynamic = { ...record.advancedDynamic!, ...changed };
        const proposal = {
          ...currentProposal,
          ...advancedDynamic,
          ...result.summary,
        };
        const candidate = withQuestionStatus(
          {
            ...record,
            advancedDynamic,
            aiFixHistory: [
              ...history,
              {
                ...result,
                proposal,
                generatedAt: new Date().toISOString(),
                processingTimeMs: Date.now() - startedAt,
              },
            ],
          },
          "pending",
        );
        const originResult = await builder.generateOriginal(
          QuizTsService.composeTemplateSource(advancedDynamic),
        );
        if (!originResult)
          throw new Error(
            "AI fix could not reproduce the original question from its origin parameters.",
          );
        const originalContent = protectedQuestionContent(record);
        const generatedContent = protectedQuestionContent(
          originResult.question as unknown as Record<string, unknown>,
        );
        const contentChanges = changedProtectedFields(
          originalContent,
          generatedContent,
        );
        if (contentChanges.length) {
          setRejectedFix({
            question: originResult.question as RuntimeQuestion,
            changedFields: contentChanges,
            original: originalContent,
            generated: generatedContent,
            candidate,
          });
          throw new ProtectedQuestionConflict(
            `AI fix changed protected question content (${contentChanges.join(", ")}). Nothing was applied.`,
          );
        }
        onApply(candidate);
        toast.show({
          title: "AI fix applied",
          description: result.summary.warnings[0] ?? result.explanation,
        });
      }
      setInstructions("");
    } catch (cause) {
      if (version !== requestVersion.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
      if (cause instanceof ProtectedQuestionConflict) {
        toast.show({
          title: previewCopy.title,
          description: previewCopy.description,
          variant: "info",
        });
        return;
      }
      console.error(`[GetGo Tools][AI ${mode}]`, cause);
      toast.show({
        title:
          message === "AI request cancelled."
            ? "AI request cancelled"
            : `AI ${mode} failed`,
        description: message,
        variant: message === "AI request cancelled." ? "info" : "error",
      });
    } finally {
      if (version === requestVersion.current) setBusy(false);
    }
  }
  function applyRejectedFix() {
    if (!rejectedFix) return;
    onApply(rejectedFix.candidate);
    setRejectedFix(null);
    setInstructions("");
    toast.show({
      title: previewCopy.applied,
      description: previewCopy.appliedDescription,
    });
  }
  function discardRejectedFix() {
    setRejectedFix(null);
    toast.show({
      title: previewCopy.discarded,
      description: previewCopy.discardedDescription,
      variant: "info",
    });
  }
  function cancel() {
    if (!window.confirm("Cancel the AI request currently in progress?")) return;
    requestVersion.current += 1;
    setBusy(false);
    toast.show({
      title: "AI request cancelled",
      description:
        "The request was dismissed. Any late result will be ignored.",
      variant: "info",
    });
    void window.getgo.cancelDynamicQuestionAi().catch(() => undefined);
  }
  return (
    <ui.Panel
      className={`ai-generator-panel ai-generator-compact ${busy ? "is-processing" : ""}`}
    >
      <form className="ai-generator-form" onSubmit={submit}>
        {busy ? (
          <div className="ai-generator-processing">
            <span className="mini-spinner" />
            <strong>
              {mode === "generate"
                ? "Generating question code…"
                : regenerationIntent
                  ? "Regenerating question code…"
                : "Fixing question code…"}
            </strong>
            <time>{elapsedLabel(elapsed)}</time>
            <ui.Button color="danger" onClick={cancel}>
              Cancel
            </ui.Button>
          </div>
        ) : (
          <>
            <div className="ai-generator-input-row">
              <textarea
                ref={instructionsRef}
                aria-label="AI instructions"
                autoFocus={mode === "fix"}
                rows={1}
                value={instructions}
                placeholder={
                  mode === "generate"
                    ? "Describe the dynamic question you want…"
                    : "Describe what the AI should fix…"
                }
                onChange={(event) => setInstructions(event.target.value)}
              />
              <ui.Button
                icon={
                  mode === "generate" ? (
                    <Sparkles size={15} />
                  ) : (
                    <Wrench size={15} />
                  )
                }
                type="submit"
                variant="solid"
              >
                {mode === "generate"
                  ? "Generate"
                  : regenerationIntent
                    ? "Regenerate"
                    : "Fix code"}
              </ui.Button>
              {record.aiResponse && (
                <ui.Button
                  className="ai-history-button"
                  variant="icon"
                  title="AI generation history"
                  aria-label="Open AI generation history"
                  onClick={onHistoryOpen}
                >
                  <History size={16} />
                </ui.Button>
              )}
            </div>
            {mode === "fix" && diagnostics.length > 0 && (
              <span className="ai-generator-diagnostics">
                {diagnostics.length} editor diagnostic
                {diagnostics.length === 1 ? "" : "s"} will be included.
              </span>
            )}
          </>
        )}
      </form>
      {rejectedFix && (
        <section
          className="ai-fix-rejected-preview"
          aria-label={previewCopy.title}
        >
          <header>
            <div>
              <h3>{previewCopy.title}</h3>
              <p>{previewCopy.description}</p>
            </div>
            <span>
              {previewCopy.changed.replace(
                "{fields}",
                rejectedFix.changedFields.join(", "),
              )}
            </span>
          </header>
          <ui.QuestionPreview
            question={rejectedFix.question}
            manifestPath={manifestPath}
            supportedLanguages={supportedLanguages}
            density="compact"
          />
          <div className="ai-fix-protected-diff">
            {rejectedFix.changedFields.map((field) => (
              <section key={field}>
                <h4>{field}</h4>
                <div>
                  <article>
                    <strong>{previewCopy.current}</strong>
                    <pre>{displayProtectedValue(rejectedFix.original[field])}</pre>
                  </article>
                  <article>
                    <strong>{previewCopy.proposed}</strong>
                    <pre>{displayProtectedValue(rejectedFix.generated[field])}</pre>
                  </article>
                </div>
              </section>
            ))}
          </div>
          <footer className="ai-fix-conflict-actions">
            <ui.Button
              icon={<X size={15} />}
              variant="outline"
              color="neutral"
              onClick={discardRejectedFix}
            >
              {previewCopy.discard}
            </ui.Button>
            <ui.Button
              icon={<Check size={15} />}
              variant="solid"
              onClick={applyRejectedFix}
            >
              {previewCopy.apply}
            </ui.Button>
          </footer>
        </section>
      )}
    </ui.Panel>
  );
}
