import { useState, type FormEvent } from "react"
import { Sparkles } from "lucide-react"
import type { DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import { DialogFrame } from "./ui/DialogFrame"
import { Button } from "./ui/Button"
import { ProcessingOverlay } from "./ui/ProcessingOverlay"
import { useToast } from "./ui/Toast"

const sourceKeys = ["paramsGeneratorTs", "questionGeneratorTs", "explanationGeneratorTs", "originParamsTs"] as const

export function DynamicQuestionAi({ record, onApply }: { record: QuizQuestionRecord; onApply(record: QuizQuestionRecord): void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [busy, setBusy] = useState(false)
  async function formatGeneratedSource(key: typeof sourceKeys[number], source: string) {
    try {
      const candidate = key === "originParamsTs" ? `(${source})` : source
      const formatted = (await QuizTsService.formatSnippet(candidate)).trim()
      if (key !== "originParamsTs") return formatted.replace(/^;(?=\s*(?:\(|function\b))/, "")
      return formatted.replace(/^;\s*/, "").replace(/^\(\s*/, "").replace(/\s*\)$/, "")
    } catch {
      // AI output belongs in the draft even when it is incomplete. The editor,
      // preview, and explicit save/build flow own code diagnostics.
      return source.trim()
    }
  }
  async function applyProposal(result: DynamicQuestionProposalResult) {
    const formatted = await Promise.all(sourceKeys.map(async key => [key, await formatGeneratedSource(key, String(result.proposal[key] ?? ""))] as const))
    onApply({
      ...record,
      verified: false,
      authoringMode: "advanced-dynamic",
      advancedDynamic: { ...record.advancedDynamic!, ...Object.fromEntries(formatted) },
      aiResponse: { ...result, generatedAt: new Date().toISOString() },
    })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setOpen(false); setBusy(true)
    try {
      const result = await window.getgo.createDynamicQuestionProposal({ question: record, instructions: instructions.trim() || undefined })
      await applyProposal(result)
      setInstructions("")
      toast.show({ title: "AI proposal applied", description: result.proposal.warnings[0] ?? result.proposal.explanation })
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); toast.show({ title: "AI generation failed", description: message, variant: "error" }) }
    finally { setBusy(false) }
  }
  return <><Button variant="solid" disabled={busy} onClick={() => setOpen(true)}><Sparkles size={15} />{busy ? "Generating…" : "AI assist"}</Button>{open && <DialogFrame title="GetGo AI assistant" hideFooter busy={false} error={null} onClose={() => setOpen(false)} onSubmit={submit}>
    <div className="auth-intro"><Sparkles /><div><strong>Generate all four independent fields locally</strong><span>GetGo Tools sends this local question directly to the configured AI API. Firebase and Firestore are not used.</span></div></div>
    <label>Instructions<textarea autoFocus rows={7} value={instructions} placeholder="Describe the dynamic behavior or changes you want. Leave blank for a general conversion." onChange={event => setInstructions(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /></label>
    <p className="form-note">Generating replaces the four editor fields in the unsaved draft. Review editor diagnostics and preview, then use Save to persist it.</p>
    <Button type="submit" variant="solid" className="ai-generate-action"><Sparkles size={15} />Generate</Button>
  </DialogFrame>}<ProcessingOverlay open={busy} showElapsed title="Generating question code…" description="The generated fields will be applied to your unsaved draft." /></>
}
