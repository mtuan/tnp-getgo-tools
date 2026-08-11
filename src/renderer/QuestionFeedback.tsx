import { useState, type FormEvent } from "react"
import { MessageSquareWarning } from "lucide-react"
import type { QuestionFeedback as Feedback, QuestionIssue } from "../core/models"
import { Button } from "./ui/Button"
import { DialogFrame } from "./ui/DialogFrame"
import { Form, type FormSchema } from "./ui/Form"

const issueFields: Array<{ name: QuestionIssue; label: string; description: string }> = [
  { name: "missing-image", label: "Missing image", description: "The question references an image that is unavailable or not displayed." },
  { name: "wrong-question", label: "Wrong question", description: "The saved question text or content is incorrect." },
  { name: "wrong-answer", label: "Wrong answer", description: "The choices or marked correct answer are incorrect." },
]

const schema: FormSchema[] = [
  ...issueFields.map(issue => ({ name: issue.name, label: issue.label, helper: issue.description, type: "toggle" as const, presentation: "row" as const })),
  { name: "note", label: "Note", helper: "Optional context that will help resolve the issue.", type: "textarea", rows: 5, placeholder: "Describe what needs attention…" },
]

export function QuestionFeedback({ feedback, onSave }: { feedback?: Feedback; onSave(value: Omit<Feedback, "updatedAt"> | null): Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const initialValues = () => ({ ...Object.fromEntries(issueFields.map(issue => [issue.name, feedback?.issues.includes(issue.name) ?? false])), note: feedback?.note ?? "" })
  const [values, setValues] = useState<Record<string, unknown>>(initialValues)
  const dirty = JSON.stringify(values) !== JSON.stringify(initialValues())
  const issueCount = feedback?.issues.length ?? 0
  const show = () => { setValues(initialValues()); setError(null); setOpen(true) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const issues = issueFields.filter(issue => values[issue.name] === true).map(issue => issue.name)
    const note = String(values.note ?? "").trim()
    setBusy(true); setError(null)
    try { await onSave(issues.length || note ? { issues, ...(note ? { note } : {}) } : null); setOpen(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <>
    <Button className={`question-feedback-button ${issueCount ? "has-issues" : ""}`} variant="icon" title={issueCount ? `${issueCount} reported issue${issueCount === 1 ? "" : "s"}` : "Report question issue"} aria-label="Report question issue" icon={<MessageSquareWarning size={16} />} onClick={show} />
    {open && <DialogFrame presentation="modal" className="question-feedback-dialog" title="Question feedback" busy={busy} error={error} submitLabel="Save feedback" submitDisabled={!dirty} saveShortcut onClose={() => setOpen(false)} onSubmit={submit}><Form fields={schema} values={values} autoFocus={false} onChange={(name, value) => setValues(current => ({ ...current, [name]: value }))} /></DialogFrame>}
  </>
}
