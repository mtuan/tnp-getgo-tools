import { useMemo, useState, type FormEvent } from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, Trash2, X } from "lucide-react"
import { supportedQuizBuilderApiVersions, type ContestSettings, type ContestSummary, type QuizCrudInput, type QuizSummary } from "../core/models"
import { Form, validateSchema, type FormErrors, type FormSchema, type FormValues } from "./ui/Form"

interface DialogFrameProps {
  title: string
  busy: boolean
  error: string | null
  children: React.ReactNode
  onClose(): void
  onSubmit(event: FormEvent): void
  onDelete?: () => Promise<void>
  presentation?: "drawer" | "modal"
}

export function DialogFrame({ title, busy, error, children, onClose, onSubmit, onDelete, presentation = "drawer" }: DialogFrameProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  return createPortal(<div className={`crud-backdrop ${presentation}`} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className={`crud-dialog ${presentation}`} role="dialog" aria-modal="true" aria-labelledby="crud-title">
      <header><h2 id="crud-title">{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X /></button></header>
      <form onSubmit={onSubmit}>
        <div className="crud-body">{error && <div className="crud-error"><AlertTriangle />{error}</div>}{children}</div>
        <footer>{onDelete && <div className="delete-action">{confirmingDelete ? <><span>Move this item to Trash?</span><button type="button" className="danger" disabled={busy} onClick={() => void onDelete()}>Move to Trash</button><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>Cancel</button></> : <button type="button" className="danger ghost" disabled={busy} onClick={() => setConfirmingDelete(true)}><Trash2 />Delete</button>}</div>}<button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></footer>
      </form>
    </section>
  </div>, document.body)
}

const defaultContestSettings = (): ContestSettings => ({
  $schema: "../settings.schema.json",
  book: { code: "", title: "", description: "", subject: 1, isActive: true },
  rounds: [{ roundCode: "MAIN", roundName: "Main Round", description: "" }],
  grades: [{ gradeName: "1", grades: [1] }],
  categories: [],
  quizRules: [],
})

export function LegacyContestCrudDialog({ contest, onClose, onSaved, onDeleted }: { contest?: ContestSummary; onClose(): void; onSaved(settings: ContestSettings): Promise<void>; onDeleted?: () => Promise<void> }) {
  const initial = useMemo(() => structuredClone(contest?.settings ?? defaultContestSettings()), [contest])
  const [id, setId] = useState(initial.book.code)
  const [title, setTitle] = useState(initial.book.title)
  const [description, setDescription] = useState(initial.book.description ?? "")
  const [subject, setSubject] = useState(initial.book.subject)
  const [active, setActive] = useState(initial.book.isActive !== false)
  const [configuration, setConfiguration] = useState(JSON.stringify({ rounds: initial.rounds, grades: initial.grades, categories: initial.categories ?? [], quizRules: initial.quizRules ?? [] }, null, 2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    try {
      const advanced = JSON.parse(configuration) as Partial<ContestSettings>
      const settings: ContestSettings = { ...initial, ...advanced, $schema: "../settings.schema.json", book: { code: id.trim().toLowerCase(), title: title.trim(), description: description.trim(), subject, isActive: active } }
      setBusy(true); await onSaved(settings)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) }
  }

  return <DialogFrame title={contest ? "Edit contest" : "Create contest"} busy={busy} error={error} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } } : undefined}>
    <div className="field-grid"><label>Contest ID<input autoFocus={!contest} required readOnly={Boolean(contest)} value={id} pattern="[a-z][-a-z0-9]*" onChange={event => setId(event.target.value)} /></label><label>Display title<input required value={title} onChange={event => setTitle(event.target.value)} /></label></div>
    <label>Description<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <div className="field-grid"><label>Subject<select value={subject} onChange={event => setSubject(Number(event.target.value))}>{["Mathematics", "English", "Vietnamese", "Physics", "Chemistry", "Biology", "History", "Geography"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label className="toggle-field"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /><span><strong>Active contest</strong><small>Visible to quiz consumers</small></span></label></div>
    <label>Advanced configuration <span className="label-help">Rounds, grades, categories and quiz rules</span><textarea className="json-editor" rows={18} spellCheck={false} value={configuration} onChange={event => setConfiguration(event.target.value)} /></label>
  </DialogFrame>
}

export function QuizCrudDialog({ quiz, contest, onClose, onSaved, onDeleted }: { quiz?: QuizSummary; contest: ContestSummary; onClose(): void; onSaved(input: QuizCrudInput): Promise<void>; onDeleted?: () => Promise<void> }) {
  const gradeMappings = useMemo(() => contest.settings.grades.map(item => ({ name: String(item.gradeName ?? ""), grades: Array.isArray(item.grades) ? item.grades.filter(value => typeof value === "number") as number[] : [] })).filter(item => item.name), [contest])
  const initialGrade = quiz?.grade ?? gradeMappings[0]?.name ?? ""
  const [input, setInput] = useState<QuizCrudInput>({ id: quiz?.id ?? "", title: quiz?.title ?? "", grade: initialGrade, grades: gradeMappings.find(item => item.name === initialGrade)?.grades ?? [], round: quiz?.round ?? String(contest.settings.rounds[0]?.roundCode ?? ""), year: quiz?.year ?? "", status: quiz?.contentStatus ?? "imported", quizBuilderApiVersion: quiz?.quizBuilderApiVersion ?? supportedQuizBuilderApiVersions[0] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const fields = useMemo<FormSchema[]>(() => [
    { type: "text", name: "id", label: "Quiz ID", required: true, readOnly: Boolean(quiz), rules: { pattern: { value: /^[a-z0-9][-a-z0-9_]*$/, message: "Use lowercase letters, numbers, hyphens, and underscores." } } },
    { type: "text", name: "title", label: "Title", required: true },
    [{ type: "text", name: "grade", label: "Grade name", required: true, placeholder: "E.g. Ecolier" }, { type: "multi-select", name: "grades", label: "School grades", required: true, options: Array.from({ length: 13 }, (_, grade) => ({ value: String(grade), label: grade === 0 ? "Kindergarten" : `Grade ${grade}` })) }],
    [{ type: "number", name: "year", label: "Year", min: 1900, max: 2100, step: 1, rules: { validate: value => !Number.isInteger(Number(value)) ? "Year must be a whole number." : Number(value) < 1900 || Number(value) > 2100 ? "Year must be between 1900 and 2100." : null } }, { type: "select", name: "round", label: "Round", options: contest.settings.rounds.map(item => ({ value: String(item.roundCode ?? ""), label: String(item.roundName ?? item.roundCode ?? "") })).filter(item => item.value) }],
    ...(quiz ? [[{ type: "select", name: "status", label: "Content status", options: ["imported", "normalized", "generated", "reviewed", "validated", "published"].map(value => ({ value, label: value })) }, { type: "select", name: "quizBuilderApiVersion", label: "QuizBuilder API version", options: supportedQuizBuilderApiVersions.map(version => ({ value: String(version), label: `Version ${version}` })) }]] as FormSchema[] : [{ type: "select", name: "quizBuilderApiVersion", label: "QuizBuilder API version", options: supportedQuizBuilderApiVersions.map(version => ({ value: String(version), label: `Version ${version}` })) } as FormSchema]),
  ], [contest, gradeMappings, quiz])
  const values: FormValues = { ...input, grades: input.grades?.map(String) ?? [], year: input.year ? Number(input.year) : undefined, quizBuilderApiVersion: String(input.quizBuilderApiVersion ?? supportedQuizBuilderApiVersions[0]) }
  const change = (name: string, value: unknown) => {
    setFieldErrors(current => { const next = { ...current }; delete next[name]; return next })
    setInput(current => {
      if (name === "grade") return { ...current, grade: String(value), grades: gradeMappings.find(item => item.name === value)?.grades ?? [] }
      if (name === "grades") return { ...current, grades: (value as string[]).map(Number).sort((a, b) => a - b) }
      if (name === "year") return { ...current, year: value === undefined ? null : String(value) }
      if (name === "quizBuilderApiVersion") return { ...current, quizBuilderApiVersion: Number(value) }
      return { ...current, [name]: value } as QuizCrudInput
    })
  }
  async function submit(event: FormEvent) { event.preventDefault(); setError(null); const errors = validateSchema(fields, values); setFieldErrors(errors); if (Object.keys(errors).length) return; setBusy(true); try { await onSaved({ ...input, id: input.id.trim().toLowerCase(), title: input.title.trim(), grade: input.grade?.trim() || null, round: input.round?.trim() || null, year: input.year?.trim() || null }) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } }
  return <DialogFrame presentation="modal" title={quiz ? "Edit quiz" : "Create quiz"} busy={busy} error={error} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } } : undefined}>
    <Form fields={fields} values={values} errors={fieldErrors} onChange={change} />
    {!quiz && <p className="form-note">A schema-valid manifest and starter <code>quiz.ts</code> will be created. You can edit questions immediately afterward.</p>}
  </DialogFrame>
}
