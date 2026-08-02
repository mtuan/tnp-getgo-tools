import { useMemo, useState, type FormEvent } from "react"
import { AlertTriangle, Trash2, X } from "lucide-react"
import type { ContestSettings, ContestSummary, QuizCrudInput, QuizSummary } from "../core/models"

interface DialogFrameProps {
  title: string
  busy: boolean
  error: string | null
  children: React.ReactNode
  onClose(): void
  onSubmit(event: FormEvent): void
  onDelete?: () => Promise<void>
}

function DialogFrame({ title, busy, error, children, onClose, onSubmit, onDelete }: DialogFrameProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  return <div className="crud-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="crud-dialog" role="dialog" aria-modal="true" aria-labelledby="crud-title">
      <header><h2 id="crud-title">{title}</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X /></button></header>
      <form onSubmit={onSubmit}>
        <div className="crud-body">{error && <div className="crud-error"><AlertTriangle />{error}</div>}{children}</div>
        <footer>{onDelete && <div className="delete-action">{confirmingDelete ? <><span>Move this item to Trash?</span><button type="button" className="danger" disabled={busy} onClick={() => void onDelete()}>Move to Trash</button><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>Cancel</button></> : <button type="button" className="danger ghost" disabled={busy} onClick={() => setConfirmingDelete(true)}><Trash2 />Delete</button>}</div>}<button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></footer>
      </form>
    </section>
  </div>
}

const defaultContestSettings = (): ContestSettings => ({
  $schema: "../settings.schema.json",
  book: { code: "", title: "", description: "", subject: 1, isActive: true },
  rounds: [{ roundCode: "MAIN", roundName: "Main Round", description: "" }],
  grades: [{ gradeName: "1", grades: [1] }],
  categories: [],
  quizRules: [],
})

export function ContestCrudDialog({ contest, onClose, onSaved, onDeleted }: { contest?: ContestSummary; onClose(): void; onSaved(settings: ContestSettings): Promise<void>; onDeleted?: () => Promise<void> }) {
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
    <div className="field-grid"><label>Contest ID<input autoFocus={!contest} required readOnly={Boolean(contest)} value={id} pattern="[a-z][a-z0-9-]*" onChange={event => setId(event.target.value)} /></label><label>Display title<input required value={title} onChange={event => setTitle(event.target.value)} /></label></div>
    <label>Description<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <div className="field-grid"><label>Subject<select value={subject} onChange={event => setSubject(Number(event.target.value))}>{["Mathematics", "English", "Vietnamese", "Physics", "Chemistry", "Biology", "History", "Geography"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label className="toggle-field"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /><span><strong>Active contest</strong><small>Visible to quiz consumers</small></span></label></div>
    <label>Advanced configuration <span className="label-help">Rounds, grades, categories and quiz rules</span><textarea className="json-editor" rows={18} spellCheck={false} value={configuration} onChange={event => setConfiguration(event.target.value)} /></label>
  </DialogFrame>
}

export function QuizCrudDialog({ quiz, onClose, onSaved, onDeleted }: { quiz?: QuizSummary; onClose(): void; onSaved(input: QuizCrudInput): Promise<void>; onDeleted?: () => Promise<void> }) {
  const [input, setInput] = useState<QuizCrudInput>({ id: quiz?.id ?? "", title: quiz?.title ?? "", grade: quiz?.grade ?? "", round: quiz?.round ?? "", year: quiz?.year ?? "", status: quiz?.contentStatus ?? "imported", quizBuilderApiVersion: quiz?.quizBuilderApiVersion ?? 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof QuizCrudInput, value: string) => setInput(current => ({ ...current, [key]: value }))
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { await onSaved({ ...input, id: input.id.trim().toLowerCase(), title: input.title.trim(), grade: input.grade?.trim() || null, round: input.round?.trim() || null, year: input.year?.trim() || null }) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } }
  return <DialogFrame title={quiz ? "Edit quiz" : "Create quiz"} busy={busy} error={error} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } } : undefined}>
    <label>Quiz ID<input autoFocus={!quiz} required readOnly={Boolean(quiz)} value={input.id} pattern="[a-z0-9][a-z0-9_-]*" onChange={event => set("id", event.target.value)} /></label>
    <label>Title<input required value={input.title} onChange={event => set("title", event.target.value)} /></label>
    <div className="field-grid"><label>Grade<input value={input.grade ?? ""} onChange={event => set("grade", event.target.value)} /></label><label>Round<input value={input.round ?? ""} onChange={event => set("round", event.target.value)} /></label></div>
    <div className="field-grid"><label>Year<input value={input.year ?? ""} onChange={event => set("year", event.target.value)} /></label><label>Content status<select value={input.status} onChange={event => setInput(current => ({ ...current, status: event.target.value as QuizCrudInput["status"] }))}>{["imported", "normalized", "generated", "reviewed", "validated", "published"].map(status => <option key={status}>{status}</option>)}</select></label></div>
    <label>QuizBuilder API version<input type="number" min="1" step="1" value={input.quizBuilderApiVersion ?? 1} onChange={event => setInput(current => ({ ...current, quizBuilderApiVersion: Number(event.target.value) }))} /></label>
    {!quiz && <p className="form-note">A schema-valid manifest and starter <code>quiz.ts</code> will be created. You can edit questions immediately afterward.</p>}
  </DialogFrame>
}
