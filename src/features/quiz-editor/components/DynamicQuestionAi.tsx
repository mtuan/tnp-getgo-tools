import { useEffect, useRef, useState, type FormEvent } from "react";
import { History, Sparkles, Wrench } from "lucide-react";
import {
  QuizTsService,
  createDynamicQuestionBuildService,
} from "@tnp/getgo-logics/authoring";
import {
  QuizBuilder,
  QuizValueSerializer,
} from "@tnp/getgo-logics/quiz-builder";
import type {
  ContestQuizQuestionRecord,
  DynamicQuestionProposalResult,
} from "../../../shared/domain/models";
import { withQuestionStatus } from "../../../features/quiz-editor/domain/question-status";
import { Button } from "../../../shared/ui/Button";
import { Panel } from "../../../shared/ui/Panel";
import { useToast } from "../../../shared/ui/Toast";

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
  diagnostics,
  hasGeneratedExplanation = false,
  onApply,
  onHistoryOpen,
}: {
  record: ContestQuizQuestionRecord;
  context: Record<string, unknown>;
  diagnostics: string[];
  hasGeneratedExplanation?: boolean;
  onApply(record: ContestQuizQuestionRecord): void;
  onHistoryOpen(): void;
}) {
  const toast = useToast();
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
    onApply(
      withQuestionStatus(
        {
          ...record,
          authoringMode: "advanced-dynamic",
          advancedDynamic: { ...record.advancedDynamic!, ...fields },
          aiResponse: {
            ...result,
            generatedAt: new Date().toISOString(),
            processingTimeMs: Date.now() - startedAt,
          },
        },
        "pending",
      ),
    );
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
    setBusy(true);
    try {
      if (mode === "generate") {
        const result = await window.getgo.createDynamicQuestionProposal({
          question: record,
          context,
          instructions: instructions.trim() || undefined,
        });
        if (version !== requestVersion.current) return;
        await applyGenerated(result, startedAt, version);
        if (version !== requestVersion.current) return;
        toast.show({
          title: "AI proposal applied",
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
        if (contentChanges.length)
          throw new Error(
            `AI fix changed protected question content (${contentChanges.join(", ")}). Nothing was applied.`,
          );
        const proposal = {
          ...currentProposal,
          ...advancedDynamic,
          ...result.summary,
        };
        onApply(
          withQuestionStatus(
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
          ),
        );
        toast.show({
          title: "AI fix applied",
          description: result.summary.warnings[0] ?? result.explanation,
        });
      }
      setInstructions("");
    } catch (cause) {
      if (version !== requestVersion.current) return;
      const message = cause instanceof Error ? cause.message : String(cause);
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
    <Panel
      className={`ai-generator-panel ai-generator-compact ${busy ? "is-processing" : ""}`}
    >
      <form className="ai-generator-form" onSubmit={submit}>
        {busy ? (
          <div className="ai-generator-processing">
            <span className="mini-spinner" />
            <strong>
              {mode === "generate"
                ? "Generating question code…"
                : "Fixing question code…"}
            </strong>
            <time>{elapsedLabel(elapsed)}</time>
            <Button color="danger" onClick={cancel}>
              Cancel
            </Button>
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
              <Button
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
                {mode === "generate" ? "Generate" : "Fix code"}
              </Button>
              {record.aiResponse && (
                <Button
                  className="ai-history-button"
                  variant="icon"
                  title="AI generation history"
                  aria-label="Open AI generation history"
                  onClick={onHistoryOpen}
                >
                  <History size={16} />
                </Button>
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
    </Panel>
  );
}
