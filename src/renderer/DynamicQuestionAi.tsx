import { useEffect, useRef, useState, type FormEvent } from "react"
import { History, Sparkles, Wrench } from "lucide-react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { Button } from "./ui/Button"
import { Panel } from "./ui/Panel"
import { useToast } from "./ui/Toast"

const sourceKeys = ["paramsGeneratorTs", "questionGeneratorTs", "explanationGeneratorTs", "originParamsTs"] as const
const elapsedLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

export function DynamicQuestionAi({ record, context, diagnostics, onApply, onHistoryOpen }: { record: QuizQuestionRecord; context: Record<string, unknown>; diagnostics: string[]; onApply(record: QuizQuestionRecord): void; onHistoryOpen(): void }) {
  const toast = useToast(); const mode = record.aiResponse ? "fix" : "generate"; const [instructions, setInstructions] = useState(""); const [busy, setBusy] = useState(false); const [cancelling, setCancelling] = useState(false); const [elapsed, setElapsed] = useState(0)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (!busy) { setElapsed(0); return }; const startedAt = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250); return () => window.clearInterval(timer) }, [busy])
  useEffect(() => { const input = instructionsRef.current; if (!input) return; input.style.height = "auto"; const contentHeight = input.scrollHeight; input.style.height = `${Math.min(contentHeight, 76)}px`; input.style.overflowY = contentHeight > 76 ? "auto" : "hidden" }, [instructions])
  async function formatSource(key: typeof sourceKeys[number], source: string) { try { const formatted = (await QuizTsService.formatSnippet(key === "originParamsTs" ? `(${source})` : source)).trim().replace(/^;\s*/, ""); return key === "originParamsTs" ? formatted.replace(/^\(\s*/, "").replace(/\s*\)$/, "") : formatted } catch { return source.trim() } }
  async function applyGenerated(result: DynamicQuestionProposalResult) { const fields = Object.fromEntries(await Promise.all(sourceKeys.map(async key => [key, await formatSource(key, String(result.proposal[key] ?? ""))]))); onApply({ ...record, verified: false, authoringMode: "advanced-dynamic", advancedDynamic: { ...record.advancedDynamic!, ...fields }, aiResponse: { ...result, generatedAt: new Date().toISOString() } }) }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return
    if (mode === "fix" && !instructions.trim()) { toast.show({ title: "Fix instructions required", description: "Describe what the AI should repair.", variant: "error" }); return }
    setBusy(true); setCancelling(false)
    try {
      if (mode === "generate") { const result = await window.getgo.createDynamicQuestionProposal({ question: record, context, instructions: instructions.trim() || undefined }); await applyGenerated(result); toast.show({ title: "AI proposal applied", description: result.proposal.warnings[0] ?? result.proposal.explanation }) }
      else {
        const history = Array.isArray(record.aiFixHistory) ? record.aiFixHistory : []
        const currentProposal = history.at(-1)?.proposal ?? record.aiResponse!.proposal
        const currentSummary = { parameterizedValues: currentProposal.parameterizedValues, explanation: currentProposal.explanation, assumptions: currentProposal.assumptions, warnings: currentProposal.warnings, confidence: currentProposal.confidence }
        const result = await window.getgo.fixDynamicQuestion({ currentCode: record.advancedDynamic!, currentSummary, context, diagnostics, instructions: instructions.trim() })
        const changed = Object.fromEntries(await Promise.all(result.changes.map(async change => [change.field, await formatSource(change.field, change.source)])))
        const proposal = { ...currentProposal, ...record.advancedDynamic!, ...changed, ...result.summary }
        onApply({ ...record, verified: false, advancedDynamic: { ...record.advancedDynamic!, ...changed }, aiFixHistory: [...history, { ...result, proposal, generatedAt: new Date().toISOString() }] })
        toast.show({ title: "AI fix applied", description: result.summary.warnings[0] ?? result.explanation })
      }
      setInstructions("")
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); toast.show({ title: message === "AI request cancelled." ? "AI request cancelled" : `AI ${mode} failed`, description: message, variant: message === "AI request cancelled." ? "info" : "error" }) } finally { setBusy(false); setCancelling(false) }
  }
  async function cancel() { if (cancelling || !window.confirm("Cancel the AI request currently in progress?")) return; setCancelling(true); await window.getgo.cancelDynamicQuestionAi() }
  return <Panel className={`ai-generator-panel ai-generator-compact ${busy ? "is-processing" : ""}`}><form className="ai-generator-form" onSubmit={submit}>{busy ? <div className="ai-generator-processing"><span className="mini-spinner" /><strong>{cancelling ? "Cancelling…" : mode === "generate" ? "Generating question code…" : "Fixing question code…"}</strong><time>{elapsedLabel(elapsed)}</time><Button color="danger" disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Cancelling…" : "Cancel"}</Button></div> : <><div className="ai-generator-input-row"><textarea ref={instructionsRef} aria-label="AI instructions" autoFocus={mode === "fix"} rows={1} value={instructions} placeholder={mode === "generate" ? "Describe the dynamic question you want…" : "Describe what the AI should fix…"} onChange={event => setInstructions(event.target.value)} /><Button type="submit" variant="solid">{mode === "generate" ? <Sparkles size={15} /> : <Wrench size={15} />}{mode === "generate" ? "Generate" : "Fix code"}</Button>{record.aiResponse && <Button className="ai-history-button" variant="icon" title="AI generation history" aria-label="Open AI generation history" onClick={onHistoryOpen}><History size={16} /></Button>}</div>{mode === "fix" && diagnostics.length > 0 && <span className="ai-generator-diagnostics">{diagnostics.length} editor diagnostic{diagnostics.length === 1 ? "" : "s"} will be included.</span>}</>}</form></Panel>
}
