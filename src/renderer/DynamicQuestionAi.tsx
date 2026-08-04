import { useEffect, useRef, useState, type FormEvent } from "react"
import { History, ImageOff, Sparkles, Wrench } from "lucide-react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { questionContainsImages } from "../core/question-images"
import { Button } from "./ui/Button"
import { Panel } from "./ui/Panel"
import { useToast } from "./ui/Toast"

const sourceKeys = ["paramsGeneratorTs", "questionGeneratorTs", "explanationGeneratorTs", "originParamsTs"] as const
const elapsedLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
const hasExplanationContent = (value: unknown): boolean => {
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.some(hasExplanationContent)
  if (value && typeof value === "object") return Object.values(value).some(hasExplanationContent)
  return false
}

export function DynamicQuestionAi({ record, context, diagnostics, hasGeneratedExplanation = false, onApply, onHistoryOpen }: { record: QuizQuestionRecord; context: Record<string, unknown>; diagnostics: string[]; hasGeneratedExplanation?: boolean; onApply(record: QuizQuestionRecord): void; onHistoryOpen(): void }) {
  const toast = useToast(); const mode = record.action === "generated" || record.aiResponse || hasExplanationContent(record.explanation) || hasGeneratedExplanation ? "fix" : "generate"; const [instructions, setInstructions] = useState(""); const [busy, setBusy] = useState(false); const [elapsed, setElapsed] = useState(0)
  const containsImages = questionContainsImages(record)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)
  const requestVersion = useRef(0)
  useEffect(() => () => { requestVersion.current += 1 }, [])
  useEffect(() => { if (!busy) { setElapsed(0); return }; const startedAt = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250); return () => window.clearInterval(timer) }, [busy])
  useEffect(() => { const input = instructionsRef.current; if (!input) return; input.style.height = "auto"; const contentHeight = input.scrollHeight; input.style.height = `${Math.min(contentHeight, 76)}px`; input.style.overflowY = contentHeight > 76 ? "auto" : "hidden" }, [instructions])
  async function formatSource(key: typeof sourceKeys[number], source: string) { try { const formatted = (await QuizTsService.formatSnippet(key === "originParamsTs" ? `(${source})` : source)).trim().replace(/^;\s*/, ""); return key === "originParamsTs" ? formatted.replace(/^\(\s*/, "").replace(/\s*\)$/, "") : formatted } catch { return source.trim() } }
  async function applyGenerated(result: DynamicQuestionProposalResult, startedAt: number, version: number) { const fields = Object.fromEntries(await Promise.all(sourceKeys.map(async key => [key, await formatSource(key, String(result.proposal[key] ?? ""))]))); if (version !== requestVersion.current) return; onApply({ ...record, action: "generated", verified: false, authoringMode: "advanced-dynamic", advancedDynamic: { ...record.advancedDynamic!, ...fields }, aiResponse: { ...result, generatedAt: new Date().toISOString(), processingTimeMs: Date.now() - startedAt } }) }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || containsImages) return
    if (mode === "fix" && !instructions.trim()) { toast.show({ title: "Fix instructions required", description: "Describe what the AI should repair.", variant: "error" }); return }
    const version = ++requestVersion.current
    const startedAt = Date.now()
    setBusy(true)
    try {
      if (mode === "generate") { const result = await window.getgo.createDynamicQuestionProposal({ question: record, context, instructions: instructions.trim() || undefined }); if (version !== requestVersion.current) return; await applyGenerated(result, startedAt, version); if (version !== requestVersion.current) return; toast.show({ title: "AI proposal applied", description: result.proposal.warnings[0] ?? result.proposal.explanation }) }
      else {
        const history = Array.isArray(record.aiFixHistory) ? record.aiFixHistory : []
        const currentProposal = history.at(-1)?.proposal ?? record.aiResponse?.proposal ?? {
          ...record.advancedDynamic!,
          parameterizedValues: [],
          explanation: "Existing generated question code.",
          assumptions: [],
          warnings: [],
          confidence: 1,
        }
        const currentSummary = { parameterizedValues: currentProposal.parameterizedValues, explanation: currentProposal.explanation, assumptions: currentProposal.assumptions, warnings: currentProposal.warnings, confidence: currentProposal.confidence }
        const result = await window.getgo.fixDynamicQuestion({ currentCode: record.advancedDynamic!, currentSummary, context, diagnostics, instructions: instructions.trim() })
        if (version !== requestVersion.current) return
        const changed = Object.fromEntries(await Promise.all(result.changes.map(async change => [change.field, await formatSource(change.field, change.source)])))
        if (version !== requestVersion.current) return
        const proposal = { ...currentProposal, ...record.advancedDynamic!, ...changed, ...result.summary }
        onApply({ ...record, verified: false, advancedDynamic: { ...record.advancedDynamic!, ...changed }, aiFixHistory: [...history, { ...result, proposal, generatedAt: new Date().toISOString(), processingTimeMs: Date.now() - startedAt }] })
        toast.show({ title: "AI fix applied", description: result.summary.warnings[0] ?? result.explanation })
      }
      setInstructions("")
    } catch (cause) { if (version !== requestVersion.current) return; const message = cause instanceof Error ? cause.message : String(cause); console.error(`[GetGo Tools][AI ${mode}]`, cause); toast.show({ title: message === "AI request cancelled." ? "AI request cancelled" : `AI ${mode} failed`, description: message, variant: message === "AI request cancelled." ? "info" : "error" }) } finally { if (version === requestVersion.current) setBusy(false) }
  }
  function cancel() { if (!window.confirm("Cancel the AI request currently in progress?")) return; requestVersion.current += 1; setBusy(false); toast.show({ title: "AI request cancelled", description: "The request was dismissed. Any late result will be ignored.", variant: "info" }); void window.getgo.cancelDynamicQuestionAi().catch(() => undefined) }
  return <Panel className={`ai-generator-panel ai-generator-compact ${busy ? "is-processing" : ""} ${containsImages ? "is-disabled" : ""}`}><form className="ai-generator-form" onSubmit={submit}>{busy ? <div className="ai-generator-processing"><span className="mini-spinner" /><strong>{mode === "generate" ? "Generating question code…" : "Fixing question code…"}</strong><time>{elapsedLabel(elapsed)}</time><Button color="danger" onClick={cancel}>Cancel</Button></div> : <><div className="ai-generator-input-row"><textarea ref={instructionsRef} aria-label="AI instructions" autoFocus={mode === "fix" && !containsImages} disabled={containsImages} rows={1} value={instructions} placeholder={containsImages ? "AI generation is unavailable for questions containing images." : mode === "generate" ? "Describe the dynamic question you want…" : "Describe what the AI should fix…"} onChange={event => setInstructions(event.target.value)} /><Button icon={containsImages ? <ImageOff size={15} /> : mode === "generate" ? <Sparkles size={15} /> : <Wrench size={15} />} disabled={containsImages} type="submit" variant="solid">{mode === "generate" ? "Generate" : "Fix code"}</Button>{record.aiResponse && <Button className="ai-history-button" variant="icon" title="AI generation history" aria-label="Open AI generation history" onClick={onHistoryOpen}><History size={16} /></Button>}</div>{containsImages ? <span className="ai-generator-disabled-reason">AI generation and fixes are disabled because this question or its answers contain image data.</span> : mode === "fix" && diagnostics.length > 0 && <span className="ai-generator-diagnostics">{diagnostics.length} editor diagnostic{diagnostics.length === 1 ? "" : "s"} will be included.</span>}</>}</form></Panel>
}
