import { useEffect, useMemo, useState, type FormEvent } from "react"
import { RotateCcw, Save } from "lucide-react"
import { supportedQuizBuilderApiVersions, type ContestSettings, type ContestSummary, type QuizCrudInput, type QuizSummary } from "../../../shared/domain/models"
import { Form, validateSchema, type FormErrors, type FormSchema, type FormValues } from "../../../shared/ui/Form"
import { DialogFrame } from "../../../shared/ui/DialogFrame"
import { AccordionSection } from "../../../shared/ui/Accordion"
import { Button } from "../../../shared/ui/Button"

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
  const dirty = id !== initial.book.code || title !== initial.book.title || description !== (initial.book.description ?? "") || subject !== initial.book.subject || active !== (initial.book.isActive !== false) || configuration !== JSON.stringify({ rounds: initial.rounds, grades: initial.grades, categories: initial.categories ?? [], quizRules: initial.quizRules ?? [] }, null, 2)

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    try {
      const advanced = JSON.parse(configuration) as Partial<ContestSettings>
      const settings: ContestSettings = { ...initial, ...advanced, $schema: "../settings.schema.json", book: { code: id.trim().toLowerCase(), title: title.trim(), description: description.trim(), subject, isActive: active } }
      setBusy(true); await onSaved(settings)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) }
  }

  return <DialogFrame title={contest ? "Edit contest" : "Create contest"} busy={busy} error={error} submitDisabled={Boolean(contest) && !dirty} saveShortcut={Boolean(contest)} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } } : undefined}>
    <div className="field-grid"><label>Contest ID<input autoFocus={!contest} required readOnly={Boolean(contest)} value={id} pattern="[a-z][-a-z0-9]*" onChange={event => setId(event.target.value)} /></label><label>Display title<input required value={title} onChange={event => setTitle(event.target.value)} /></label></div>
    <label>Description<textarea rows={2} value={description} onChange={event => setDescription(event.target.value)} /></label>
    <div className="field-grid"><label>Subject<select value={subject} onChange={event => setSubject(Number(event.target.value))}>{["Mathematics", "English", "Vietnamese", "Physics", "Chemistry", "Biology", "History", "Geography"].map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label className="toggle-field"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /><span><strong>Active contest</strong><small>Visible to quiz consumers</small></span></label></div>
    <label>Advanced configuration <span className="label-help">Rounds, grades, categories and quiz rules</span><textarea className="json-editor" rows={18} spellCheck={false} value={configuration} onChange={event => setConfiguration(event.target.value)} /></label>
  </DialogFrame>
}

export function QuizCrudDialog({ quiz, contest, onClose, onSaved, onDeleted, embedded = false, onDirtyChange }: { quiz?: QuizSummary; contest: ContestSummary; onClose(): void; onSaved(input: QuizCrudInput): Promise<void>; onDeleted?: () => Promise<void>; embedded?: boolean; onDirtyChange?(dirty: boolean): void }) {
  const gradeMappings = useMemo(() => contest.settings.grades.map(item => ({ name: String(item.gradeName ?? ""), grades: Array.isArray(item.grades) ? item.grades.filter(value => typeof value === "number") as number[] : [] })).filter(item => item.name), [contest])
  const initialGrade = quiz?.grade ?? gradeMappings[0]?.name ?? ""
  const initialInput = useMemo<QuizCrudInput>(() => ({ id: quiz?.id ?? "", title: quiz?.title ?? "", icon: quiz?.icon ?? "", type: quiz?.type ?? "contest", language: quiz?.language ?? "en", grade: initialGrade, round: quiz?.round ?? String(contest.settings.rounds[0]?.roundCode ?? ""), year: quiz?.year ?? "", status: quiz?.contentStatus ?? "imported", quizBuilderApiVersion: quiz?.quizBuilderApiVersion ?? supportedQuizBuilderApiVersions[0] }), [contest.settings.rounds, initialGrade, quiz])
  const [input, setInput] = useState<QuizCrudInput>(() => initialInput)
  const [savedInput, setSavedInput] = useState<QuizCrudInput>(() => initialInput)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [iconPreview, setIconPreview] = useState("")
  const [expanded, setExpanded] = useState(true)
  const dirty = JSON.stringify(input) !== JSON.stringify(savedInput)
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => {
    const reference = input.icon
    if (!reference?.startsWith("asset:") || !contest.settingsPath.includes("content-v2")) {
      setIconPreview("")
      return
    }
    let active = true
    void window.getgo.readContentV2TopicAsset(contest.id, reference.slice("asset:".length))
      .then(value => { if (active) setIconPreview(value) })
      .catch(() => { if (active) setIconPreview("") })
    return () => { active = false }
  }, [contest.id, contest.settingsPath, input.icon])
  const fields = useMemo<FormSchema[]>(() => [
    { type: "text", name: "id", label: "Quiz ID", required: true, readOnly: Boolean(quiz), rules: { pattern: { value: /^[a-z0-9][-a-z0-9_]*$/, message: "Use lowercase letters, numbers, hyphens, and underscores." } } },
    { type: "text", name: "title", label: "Title", required: true },
    { type: "icon", name: "icon", label: "Icon", maxBytes: 2097152, previewSrc: iconPreview, helper: "Choose an image or a predefined Unicode symbol." },
    { type: "select", name: "type", label: "Quiz type", required: true, presentation: "segmented", options: [{ value: "contest", label: "Contest" }, { value: "alphabet", label: "Alphabet" }, { value: "pronunciation", label: "Vietnamese pronunciation" }] },
    ...(input.type === "alphabet" ? [{ type: "select", name: "language", label: "Language", required: true, presentation: "segmented", options: [{ value: "en", label: "English" }, { value: "vi", label: "Vietnamese" }] } as FormSchema] : []),
    ...(input.type === "contest" ? [
      { type: "select", name: "grade", label: "Grade", required: true, options: gradeMappings.map(item => ({ value: item.name, label: `${item.name} · ${item.grades.map(grade => grade === 0 ? "K" : grade).join(", ")}` })) } as FormSchema,
      [{ type: "number", name: "year", label: "Year", min: 1900, max: 2100, step: 1, rules: { validate: value => !Number.isInteger(Number(value)) ? "Year must be a whole number." : Number(value) < 1900 || Number(value) > 2100 ? "Year must be between 1900 and 2100." : null } }, { type: "select", name: "round", label: "Round", options: contest.settings.rounds.map(item => ({ value: String(item.roundCode ?? ""), label: String(item.roundName ?? item.roundCode ?? "") })).filter(item => item.value) }] as FormSchema,
    ] : []),
  ], [contest, gradeMappings, iconPreview, input.type, quiz])
  const values: FormValues = { ...input, year: input.year ? Number(input.year) : undefined, quizBuilderApiVersion: String(input.quizBuilderApiVersion ?? supportedQuizBuilderApiVersions[0]) }
  const change = (name: string, value: unknown) => {
    setFieldErrors(current => { const next = { ...current }; delete next[name]; return next })
    setInput(current => {
      if (name === "type") {
        const type = value as QuizCrudInput["type"]
        return type === "contest"
          ? { ...current, type, grade: current.grade || initialGrade, round: current.round || String(contest.settings.rounds[0]?.roundCode ?? ""), year: current.year || "" }
          : { ...current, type, language: type === "pronunciation" ? "vi" : current.language ?? "en", grade: null, round: null, year: null }
      }
      if (name === "language") return { ...current, language: value === "vi" ? "vi" : "en" }
      if (name === "grade") return { ...current, grade: String(value) }
      if (name === "year") return { ...current, year: value === undefined ? null : String(value) }
      if (name === "quizBuilderApiVersion") return { ...current, quizBuilderApiVersion: Number(value) }
      return { ...current, [name]: value } as QuizCrudInput
    })
  }
  async function submit(event: FormEvent) { event.preventDefault(); setError(null); const errors = validateSchema(fields, values); setFieldErrors(errors); if (Object.keys(errors).length) return; const normalized = { ...input, id: input.id.trim().toLowerCase(), title: input.title.trim(), icon: input.icon?.trim() || undefined, sharedCode: input.sharedCode?.trim() ?? "", language: input.type === "alphabet" ? input.language ?? "en" : input.type === "pronunciation" ? "vi" : undefined, grade: input.type === "contest" ? input.grade?.trim() || null : null, round: input.type === "contest" ? input.round?.trim() || null : null, year: input.type === "contest" ? input.year?.trim() || null : null }; setBusy(true); try { await onSaved(normalized); setInput(normalized); setSavedInput(normalized); setBusy(false) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } }
  const editor = <DialogFrame presentation={embedded ? "embedded" : "drawer"} formId={embedded ? "quiz-info-form" : undefined} hideFooter={embedded} onReset={() => { setInput(structuredClone(savedInput)); setFieldErrors({}); setError(null) }} title={quiz ? "Edit quiz" : "Create quiz"} submitLabel={quiz ? "Save changes" : "Create"} submitDisabled={Boolean(quiz) && !dirty} saveShortcut={Boolean(quiz)} busy={busy} error={error} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setBusy(false) } } : undefined}>
    <Form fields={fields} values={values} errors={fieldErrors} onChange={change} />
    {!quiz && <p className="form-note">A schema-valid manifest and starter <code>quiz.ts</code> will be created. You can edit questions immediately afterward.</p>}
  </DialogFrame>
  return embedded ? <AccordionSection groupId="general" variant="panel" title="General information" description="Identity, type, language, and quiz classification." expanded={expanded} onExpandedChange={setExpanded} actions={<><Button type="reset" form="quiz-info-form" color="neutral" icon={<RotateCcw />} disabled={!dirty || busy}>Discard</Button><Button type="submit" form="quiz-info-form" variant="solid" color="primary" icon={<Save />} disabled={!dirty || busy} loading={busy}>Save</Button></>}>{editor}</AccordionSection> : editor
}
