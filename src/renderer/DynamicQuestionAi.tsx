import { useEffect, useState, type FormEvent } from "react"
import { Sparkles, Wrench } from "lucide-react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { Button } from "./ui/Button"
import { Panel } from "./ui/Panel"
import { useToast } from "./ui/Toast"

const sourceKeys = ["paramsGeneratorTs", "questionGeneratorTs", "explanationGeneratorTs", "originParamsTs"] as const
const elapsedLabel = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`

export function DynamicQuestionAi({ record, context, diagnostics, onApply }: { record: QuizQuestionRecord; context: Record<string, unknown>; diagnostics: string[]; onApply(record: QuizQuestionRecord): void }) {
  const toast = useToast(); const mode = record.aiResponse ? "fix" : "generate"; const [instructions, setInstructions] = useState(""); const [busy, setBusy] = useState(false); const [elapsed, setElapsed] = useState(0)
  useEffect(() => { if (!busy) { setElapsed(0); return }; const startedAt = Date.now(); const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 250); return () => window.clearInterval(timer) }, [busy])
  async function formatSource(key: typeof sourceKeys[number], source: string) { try { const formatted = (await QuizTsService.formatSnippet(key === "originParamsTs" ? `(${source})` : source)).trim().replace(/^;\s*/, ""); return key === "originParamsTs" ? formatted.replace(/^\(\s*/, "").replace(/\s*\)$/, "") : formatted } catch { return source.trim() } }
  async function applyGenerated(result: DynamicQuestionProposalResult) { const fields = Object.fromEntries(await Promise.all(sourceKeys.map(async key => [key, await formatSource(key, String(result.proposal[key] ?? ""))]))); onApply({ ...record, verified: false, authoringMode: "advanced-dynamic", advancedDynamic: { ...record.advancedDynamic!, ...fields }, aiResponse: { ...result, generatedAt: new Date().toISOString() } }) }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return
    if (mode === "fix" && !instructions.trim()) { toast.show({ title: "Fix instructions required", description: "Describe what the AI should repair.", variant: "error" }); return }
    setBusy(true)
    try {
      if (mode === "generate") { const result = await window.getgo.createDynamicQuestionProposal({ question: record, context, instructions: instructions.trim() || undefined }); await applyGenerated(result); toast.show({ title: "AI proposal applied", description: result.proposal.warnings[0] ?? result.proposal.explanation }) }
      else { const result = await window.getgo.fixDynamicQuestion({ currentCode: record.advancedDynamic!, context, diagnostics, instructions: instructions.trim() }); const changed = Object.fromEntries(await Promise.all(result.changes.map(async change => [change.field, await formatSource(change.field, change.source)]))); onApply({ ...record, verified: false, advancedDynamic: { ...record.advancedDynamic!, ...changed }, aiFixHistory: [...(Array.isArray(record.aiFixHistory) ? record.aiFixHistory : []), { ...result, generatedAt: new Date().toISOString() }] }); toast.show({ title: "AI fix applied", description: result.warnings[0] ?? result.explanation }) }
      setInstructions("")
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); toast.show({ title: `AI ${mode} failed`, description: message, variant: "error" }) } finally { setBusy(false) }
  }
  return <Panel className={`ai-generator-panel ${busy ? "is-processing" : ""}`} title={mode === "generate" ? "AI generator" : "AI code fix"} description={mode === "generate" ? "Generate a complete dynamic question draft." : "Repair only the necessary current code fields."}><form className="ai-generator-form" onSubmit={submit}>{busy ? <div className="ai-generator-processing"><span className="mini-spinner" /><strong>{mode === "generate" ? "Generating question code…" : "Fixing question code…"}</strong><time>{elapsedLabel(elapsed)}</time></div> : <><textarea aria-label="AI instructions" autoFocus={mode === "fix"} rows={5} value={instructions} placeholder={mode === "generate" ? "Optional: describe the dynamic behavior you want." : "Required: describe the problem and expected correction."} onChange={event => setInstructions(event.target.value)} />{mode === "fix" && diagnostics.length > 0 && <span className="ai-generator-diagnostics">{diagnostics.length} editor diagnostic{diagnostics.length === 1 ? "" : "s"} will be included.</span>}<Button type="submit" variant="solid">{mode === "generate" ? <Sparkles size={15} /> : <Wrench size={15} />}{mode === "generate" ? "Generate" : "Fix code"}</Button></>}</form></Panel>
}
