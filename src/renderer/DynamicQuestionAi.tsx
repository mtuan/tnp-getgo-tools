import { useState, type FormEvent } from "react"
import { Sparkles } from "lucide-react"
import type { DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import { DialogFrame } from "./ui/DialogFrame"
import { Button } from "./ui/Button"
import { useToast } from "./ui/Toast"
import { useAuth } from "./AuthContext"

const sourceKeys = ["paramsGeneratorTs", "questionGeneratorTs", "explanationGeneratorTs", "originParamsTs"] as const

export function DynamicQuestionAi({ contestId, quizId, questionId, record, onApply }: { contestId: string; quizId: string; questionId: string; record: QuizQuestionRecord; onApply(record: QuizQuestionRecord): void }) {
  const toast = useToast()
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [instructions, setInstructions] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function applyProposal(result: DynamicQuestionProposalResult) {
    const formatted = await Promise.all(sourceKeys.map(async key => [key, (await QuizTsService.formatSnippet(String(result.proposal[key] ?? ""))).trim().replace(/^;(?=\s*(?:\(|function\b))/, "")] as const))
    onApply({ ...record, verified: false, authoringMode: "advanced-dynamic", advancedDynamic: { ...record.advancedDynamic!, ...Object.fromEntries(formatted) } })
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null)
    try {
      const result = await window.getgo.createDynamicQuestionProposal({ contestId, quizId, questionId, instructions: instructions.trim() || undefined })
      await applyProposal(result)
      setOpen(false); setInstructions("")
      toast.show({ title: "AI proposal applied", description: result.proposal.warnings[0] ?? result.proposal.explanation })
    } catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message); toast.show({ title: "AI generation failed", description: message, variant: "error" }) }
    finally { setBusy(false) }
  }
  return <><Button variant="solid" onClick={() => auth.requireAuth(() => setOpen(true))}><Sparkles size={15} />AI assist</Button>{open && <DialogFrame title="GetGo AI assistant" submitLabel="Generate and apply" busy={busy} error={error} onClose={() => setOpen(false)} onSubmit={submit}>
    <div className="auth-intro"><Sparkles /><div><strong>Generate all four independent fields</strong><span>The same GetGo web-admin service will propose parameters, question, explanation, and original parameters code.</span></div></div>
    <label>Instructions<textarea autoFocus rows={7} value={instructions} placeholder="Describe the dynamic behavior or changes you want. Leave blank for a general conversion." onChange={event => setInstructions(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} /></label>
    <p className="form-note">Generating replaces the four editor fields in the unsaved draft. Review the preview, then use Save question to persist it.</p>
  </DialogFrame>}</>
}
