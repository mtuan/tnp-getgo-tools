import { useEffect, useState, type FormEvent } from "react"
import { BookOpen, Layers3, Pencil, Plus, RotateCcw, Save, Settings2, Tags, Trash2, UsersRound } from "lucide-react"
import type { ContestSettings, ContestSummary } from "../../../shared/domain/models"
import { DialogFrame } from "../../../shared/ui/DialogFrame"
import { Form, validateSchema, type FormErrors, type FormRow, type FormSchema, type FormValues } from "../../../shared/ui/Form"
import { EditTable, type EditColumnDef } from "../../../shared/ui/EditTable"
import { AccordionSection } from "../../../shared/ui/Accordion"
import { Button } from "../../../shared/ui/Button"
import { DataTable, type DataColumn } from "../../../shared/ui/DataTable"

type Tab = "general" | "rounds" | "grades" | "categories" | "rules"
type Item = Record<string, unknown>

const tabs: Array<{ id: Tab; label: string; icon: typeof BookOpen }> = [
  { id: "general", label: "General", icon: BookOpen },
  { id: "rounds", label: "Rounds", icon: Layers3 },
  { id: "grades", label: "Grades", icon: UsersRound },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "rules", label: "Quiz rules", icon: Settings2 },
]

const emptySettings = (): ContestSettings => ({
  $schema: "../settings.schema.json",
  book: { code: "", title: "", description: "", topicType: "competition", subject: 1, isActive: true },
  rounds: [{ roundCode: "MAIN", roundName: "Main Round", description: "" }],
  grades: [{ gradeName: "1", grades: [1] }],
  categories: [], quizRules: [],
})

const generalFields = (iconPreview: string, topicMode: boolean): FormSchema[] => [
  { section: topicMode ? "Topic information" : "Contest information", description: "Identity and visibility across GetGo.", fields: [
    [
      { type: "text", name: "code", label: "Contest ID", required: true, rules: { pattern: { value: /^[a-z][-a-z0-9]*$/, message: "Use lowercase letters, numbers, and hyphens." } } },
      { type: "text", name: "title", label: "Display title", required: true },
    ],
    [
      { type: "icon", name: "icon", label: "Icon", maxBytes: 2097152, previewSrc: iconPreview, helper: "Choose an image, a Unicode symbol, or a four-letter text monogram." },
      { type: "textarea", name: "description", label: "Description", rows: 3 },
    ],
    [
      { type: "select", name: "subject", label: "Subject", options: ["Mathematics", "English", "Vietnamese", "Physics", "Chemistry", "Biology", "History", "Geography"].map((label, index) => ({ label, value: String(index + 1) })) },
      { type: "toggle", name: "isActive", label: topicMode ? "Active topic" : "Active contest" },
    ],
    ...(topicMode ? [[
      { type: "select" as const, name: "topicType", label: "Topic type", options: [
        { value: "competition", label: "Contest" },
        { value: "kid-learning", label: "Kid learning" },
      ] },
    ]] : []),
  ] as FormRow[] },
]

const gradeColumns: EditColumnDef<Item>[] = [
  { key: "gradeName", dataKey: "gradeName", title: "Grade name", width: "42%", field: { type: "text", name: "gradeName", placeholder: "E.g. Benjamin" } },
  { key: "grades", dataKey: "grades", title: "School grades", field: { type: "multi-select", name: "grades", options: Array.from({ length: 13 }, (_, grade) => ({ value: String(grade), label: grade === 0 ? "Kindergarten" : `Grade ${grade}` })) } },
]

const roundColumns: EditColumnDef<Item>[] = [
  { key: "roundCode", dataKey: "roundCode", title: "Code", width: "18%", field: { type: "text", name: "roundCode", placeholder: "MAIN" } },
  { key: "roundName", dataKey: "roundName", title: "Round name", width: "27%", field: { type: "text", name: "roundName", placeholder: "Main Round" } },
  { key: "description", dataKey: "description", title: "Description", field: { type: "text", name: "description", placeholder: "Optional" } },
  { key: "hasPractice", dataKey: "hasPractice", title: "Practice", width: 76, field: { type: "toggle", name: "hasPractice" } },
]

const text = (value: unknown) => typeof value === "string" ? value : ""
const number = (value: unknown, fallback = 0) => typeof value === "number" ? value : fallback
const strings = (value: unknown) => Array.isArray(value) ? value.join(", ") : ""
const parseStrings = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean)

function RuleEditorDrawer({ rule, rounds, grades, onClose, onSave }: { rule: Item; rounds: Item[]; grades: Item[]; onClose(): void; onSave(rule: Item): void }) {
  const [draft, setDraft] = useState<Item>(() => structuredClone(rule))
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule)
  const editing = Boolean(text(rule.roundCode))
  const set = (patch: Item) => setDraft(current => ({ ...current, ...patch }))
  const breakdown = (Array.isArray(draft.categories) ? draft.categories : []) as Item[]
  const setBreakdown = (categories: Item[]) => set({ categories })
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ ...draft, roundCode: text(draft.roundCode).toUpperCase(), gradeNames: Array.isArray(draft.gradeNames) ? draft.gradeNames : ["*"] }) }
  return <DialogFrame title={editing ? "Edit quiz rule" : "Add quiz rule"} busy={false} error={null} onClose={onClose} onSubmit={submit} submitLabel={editing ? "Save rule" : "Add rule"} submitDisabled={editing && !dirty} saveShortcut={editing}>
    <Form fields={[
      [{ type: "select", name: "roundCode", label: "Round", options: rounds.map(round => ({ value: text(round.roundCode), label: text(round.roundName) || text(round.roundCode) })).filter(option => option.value) }, { type: "multi-select", name: "gradeNames", label: "Grades", options: [...grades.map(grade => ({ value: text(grade.gradeName), label: text(grade.gradeName) })).filter(option => option.value), { value: "*", label: "All grades" }] }],
      [{ type: "select", name: "answerType", label: "Answer type", options: [{ value: "0", label: "Multiple choice" }, { value: "1", label: "Input" }, { value: "2", label: "Mixed" }] }, { type: "number", name: "totalQuestions", label: "Questions", min: 1, step: 1 }],
      [{ type: "number", name: "totalPoints", label: "Total points", min: 0 }, { type: "number", name: "initPoints", label: "Initial points", min: 0 }],
      [{ type: "number", name: "timeLimit", label: "Time (seconds)", min: 0 }],
    ]} values={{ roundCode: text(draft.roundCode), gradeNames: Array.isArray(draft.gradeNames) ? draft.gradeNames : [], answerType: String(number(draft.answerType)), totalQuestions: number(draft.totalQuestions, 1), totalPoints: number(draft.totalPoints), initPoints: number(draft.initPoints), timeLimit: number(draft.timeLimit) }} onChange={(name, value) => set({ [name]: ["answerType", "totalQuestions", "totalPoints", "initPoints", "timeLimit"].includes(name) ? Number(value) : value })} />
    <div className="breakdown-heading"><strong>Scoring categories</strong><button type="button" onClick={() => setBreakdown([...breakdown, { categoryName: "", categoryNo: breakdown.length + 1, questionCount: 0, correctPoints: 0, wrongPoints: 0, noAnswerPoints: 0 }])}><Plus />Add</button></div>
    {breakdown.map((category, index) => <div className="breakdown-row" key={index}><input aria-label="Category name" placeholder="Category" value={text(category.categoryName)} onChange={event => { const next = [...breakdown]; next[index] = { ...category, categoryName: event.target.value }; setBreakdown(next) }} /><input aria-label="Question count" type="number" value={number(category.questionCount)} onChange={event => { const next = [...breakdown]; next[index] = { ...category, questionCount: Number(event.target.value) }; setBreakdown(next) }} /><input aria-label="Correct points" type="number" value={number(category.correctPoints)} onChange={event => { const next = [...breakdown]; next[index] = { ...category, correctPoints: Number(event.target.value) }; setBreakdown(next) }} /><input aria-label="Wrong points" type="number" value={number(category.wrongPoints)} onChange={event => { const next = [...breakdown]; next[index] = { ...category, wrongPoints: Number(event.target.value) }; setBreakdown(next) }} /><button type="button" onClick={() => setBreakdown(breakdown.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button></div>)}
  </DialogFrame>
}

export function ContestSettingsDialog({ contest, onClose, onSaved, onDeleted, embedded = false, topicMode = false, onDirtyChange }: { contest?: ContestSummary; onClose(): void; onSaved(settings: ContestSettings): Promise<void>; onDeleted?: () => Promise<void>; embedded?: boolean; topicMode?: boolean; onDirtyChange?(dirty: boolean): void }) {
  const [settings, setSettings] = useState<ContestSettings>(() => structuredClone(contest?.settings ?? emptySettings()))
  const [tab, setTab] = useState<Tab>("general")
  const [expanded, setExpanded] = useState<Tab | null>("general")
  const [ruleEditor, setRuleEditor] = useState<number | "create" | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [iconPreview, setIconPreview] = useState("")
  const [persistedSettings, setPersistedSettings] = useState<ContestSettings>(() => structuredClone(contest?.settings ?? emptySettings()))
  const dirty = JSON.stringify(settings) !== JSON.stringify(persistedSettings)
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  const isContestTopic = !topicMode || settings.book.topicType !== "kid-learning"
  const visibleTabs = isContestTopic ? tabs : tabs.filter(item => item.id === "general")
  useEffect(() => {
    if (!isContestTopic) { setTab("general"); setExpanded("general") }
  }, [isContestTopic])
  useEffect(() => {
    const reference = settings.book.icon
    if (!contest || !reference?.startsWith("asset:") || !contest.settingsPath.includes("content-v2")) {
      setIconPreview("")
      return
    }
    let active = true
    void window.getgo.readContentV2TopicAsset(contest.id, reference.slice("asset:".length))
      .then(value => { if (active) setIconPreview(value) })
      .catch(() => { if (active) setIconPreview("") })
    return () => { active = false }
  }, [contest, settings.book.icon])
  const setBook = (patch: Partial<ContestSettings["book"]>) => setSettings(current => ({ ...current, book: { ...current.book, ...patch } }))
  const setList = (key: "rounds" | "grades" | "categories" | "quizRules", list: Item[]) => setSettings(current => ({ ...current, [key]: list }))
  const update = (key: "rounds" | "grades" | "categories" | "quizRules", index: number, patch: Item) => {
    const list = [...(settings[key] ?? [])] as Item[]; list[index] = { ...list[index], ...patch }; setList(key, list)
  }
  const remove = (key: "rounds" | "grades" | "categories" | "quizRules", index: number) => setList(key, ([...(settings[key] ?? [])] as Item[]).filter((_, itemIndex) => itemIndex !== index))
  const add = (key: "rounds" | "grades" | "categories" | "quizRules", value: Item) => setList(key, [...(settings[key] ?? []), value] as Item[])

  async function save(scope: Tab | "all") {
    setError(null)
    if (scope === "general" || scope === "all") {
      const errors = validateSchema(generalFields(iconPreview, topicMode), generalValues)
      setFieldErrors(errors)
      if (Object.keys(errors).length) { setTab("general"); setExpanded("general"); return }
    }
    const gradesToSave = settings.grades.filter(grade => text(grade.gradeName).trim() || (Array.isArray(grade.grades) && grade.grades.length > 0))
    const incompleteGrade = gradesToSave.find(grade => !text(grade.gradeName).trim() || !Array.isArray(grade.grades) || grade.grades.length === 0)
    if ((scope === "grades" || scope === "all") && incompleteGrade) { setTab("grades"); setExpanded("grades"); setError("Every grade row needs a grade name and at least one school grade."); return }
    const roundsToSave = settings.rounds.filter(round => text(round.roundCode).trim() || text(round.roundName).trim() || text(round.description).trim() || round.hasPractice === true)
    const incompleteRound = roundsToSave.find(round => !text(round.roundCode).trim() || !text(round.roundName).trim())
    if ((scope === "rounds" || scope === "all") && incompleteRound) { setTab("rounds"); setExpanded("rounds"); setError("Every round row needs a round code and round name."); return }
    setBusy(true)
    try { const saved = { ...settings, rounds: roundsToSave, grades: gradesToSave, $schema: "../settings.schema.json", book: { ...settings.book, code: settings.book.code.trim().toLowerCase(), title: settings.book.title.trim(), description: settings.book.description?.trim() } }; await onSaved(saved); setSettings(saved); setPersistedSettings(structuredClone(saved)); setBusy(false) }
    catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  async function submit(event: FormEvent) { event.preventDefault(); await save("all") }

  const rounds = settings.rounds as Item[]
  const grades = settings.grades as Item[]
  const categories = (settings.categories ?? []) as Item[]
  const rules = (settings.quizRules ?? []) as Item[]
  const categoryColumns: EditColumnDef<Item>[] = [
    { key: "categoryName", dataKey: "categoryName", title: "Category name", width: "22%", field: { type: "text", name: "categoryName", placeholder: "Arithmetic" } },
    { key: "roundCodes", dataKey: "roundCodes", title: "Round codes", width: "28%", field: { type: "multi-select", name: "roundCodes", options: rounds.map(round => ({ value: text(round.roundCode), label: text(round.roundName) || text(round.roundCode) })).filter(option => option.value) } },
    { key: "roundHint", dataKey: "roundHint", title: "Round hint", width: "18%", field: { type: "text", name: "roundHint", placeholder: "Optional" } },
    { key: "patterns", dataKey: "patterns", title: "Matching patterns", field: { type: "text", name: "patterns", placeholder: "ARITHMETIC, ALGEBRA" } },
  ]
  const ruleColumns: DataColumn<Item>[] = [
    { key: "round", title: "Round", width: "18%", render: rule => <strong>{text(rule.roundCode) || "—"}</strong> },
    { key: "grades", title: "Grades", width: "20%", render: rule => strings(rule.gradeNames) || "All grades" },
    { key: "questions", title: "Questions", width: "12%", render: rule => number(rule.totalQuestions, 1) },
    { key: "points", title: "Points", width: "12%", render: rule => number(rule.totalPoints) },
    { key: "time", title: "Time", width: "14%", render: rule => `${number(rule.timeLimit)} sec` },
    { key: "categories", title: "Categories", width: "12%", render: rule => Array.isArray(rule.categories) ? rule.categories.length : 0 },
    { key: "actions", title: "", width: 84, render: (_rule, index) => <div className="ui-row-actions"><button type="button" onClick={() => setRuleEditor(index)} aria-label={`Edit rule ${index + 1}`}><Pencil /></button><button type="button" onClick={() => remove("quizRules", index)} aria-label={`Delete rule ${index + 1}`}><Trash2 /></button></div> },
  ]
  const generalValues: FormValues = { code: settings.book.code, title: settings.book.title, icon: settings.book.icon ?? "", description: settings.book.description ?? "", topicType: settings.book.topicType ?? "competition", subject: String(settings.book.subject), isActive: settings.book.isActive !== false }
  const updateGeneral = (name: string, value: unknown) => {
    setFieldErrors(current => { const next = { ...current }; delete next[name]; return next })
    if (name === "topicType") setBook({ topicType: value === "kid-learning" ? "kid-learning" : "competition" })
    else if (name === "subject") setBook({ subject: Number(value) })
    else if (name === "isActive") setBook({ isActive: Boolean(value) })
    else if (name === "code" || name === "title" || name === "description" || name === "icon") setBook({ [name]: String(value) })
  }
  const sectionDirty = (id: Tab) => {
    if (id === "general") return JSON.stringify(settings.book) !== JSON.stringify(persistedSettings.book)
    if (id === "rounds") return JSON.stringify(settings.rounds) !== JSON.stringify(persistedSettings.rounds)
    if (id === "grades") return JSON.stringify(settings.grades) !== JSON.stringify(persistedSettings.grades)
    if (id === "categories") return JSON.stringify(settings.categories ?? []) !== JSON.stringify(persistedSettings.categories ?? [])
    return JSON.stringify(settings.quizRules ?? []) !== JSON.stringify(persistedSettings.quizRules ?? [])
  }
  const discardSection = (id: Tab) => {
    const saved = structuredClone(persistedSettings)
    setError(null)
    if (id === "general") { setFieldErrors({}); setSettings(current => ({ ...current, book: saved.book })) }
    else if (id === "rounds") setSettings(current => ({ ...current, rounds: saved.rounds }))
    else if (id === "grades") setSettings(current => ({ ...current, grades: saved.grades }))
    else if (id === "categories") setSettings(current => ({ ...current, categories: saved.categories ?? [] }))
    else setSettings(current => ({ ...current, quizRules: saved.quizRules ?? [] }))
  }
  const renderSection = (id: Tab, title: string, description: string, content: React.ReactNode) => embedded
    ? <AccordionSection key={id} groupId={id} variant="panel" title={title} description={description} expanded={expanded === id} onExpandedChange={open => setExpanded(open ? id : null)} actions={<><Button color="neutral" icon={<RotateCcw />} disabled={!sectionDirty(id) || busy} onClick={() => discardSection(id)}>Discard</Button><Button variant="solid" color="primary" icon={<Save />} disabled={!sectionDirty(id) || busy} loading={busy} onClick={() => void save(id)}>Save</Button></>}>{content}</AccordionSection>
    : tab === id ? content : null
  return <DialogFrame presentation={embedded ? "embedded" : "drawer"} formId={embedded ? "topic-info-form" : undefined} hideFooter={embedded} onReset={() => { setSettings(structuredClone(persistedSettings)); setFieldErrors({}); setError(null) }} title={embedded ? (topicMode ? "Topic information" : "Contest information") : contest ? `Edit ${topicMode ? "topic" : "contest"}` : `Create ${topicMode ? "topic" : "contest"}`} submitLabel={contest ? "Save changes" : "Create"} submitDisabled={Boolean(contest) && !dirty} saveShortcut={Boolean(contest)} busy={busy} error={error} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)) } } : undefined}>
    {contest && !embedded && <div className="settings-tabs" role="tablist">{visibleTabs.map(item => { const Icon = item.icon; const count = item.id === "rounds" ? rounds.length : item.id === "grades" ? grades.length : item.id === "categories" ? categories.length : item.id === "rules" ? rules.length : null; return <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} key={item.id}><Icon />{item.label}{count !== null && <i>{count}</i>}</button> })}</div>}
    <div className="settings-tab-content" key={tab}>
      {renderSection("general", "General information", topicMode ? "Identity and topic type." : "Identity, subject, and contest visibility.", <Form fields={generalFields(iconPreview, topicMode).map(entry => "section" in entry ? { ...entry, fields: entry.fields.map(row => Array.isArray(row) ? row.map(field => field.name === "code" ? { ...field, readOnly: Boolean(contest) } : field) : row.name === "code" ? { ...row, readOnly: Boolean(contest) } : row) } : entry)} values={generalValues} errors={fieldErrors} onChange={updateGeneral} />)}
      {isContestTopic && renderSection("rounds", "Contest rounds", "Stages and practice availability.", <><div className="section-heading"><div><h3>Contest rounds</h3><p>Edit stages and practice availability inline.</p></div></div><EditTable ariaLabel="Contest rounds" columns={roundColumns} rows={rounds} reorderable onRowsReorder={rows => setList("rounds", rows)} onRowChange={(index, field, value) => update("rounds", index, field === "roundCode" ? { roundCode: String(value).toUpperCase() } : { [field]: value })} onRowAdd={() => add("rounds", { roundCode: "", roundName: "", description: "", hasPractice: false })} onRowDelete={index => remove("rounds", index)} addLabel="Add round" emptyText="No rounds yet." /></>)}
      {isContestTopic && renderSection("grades", "Grade mappings", "Grade names and numeric school grades.", <><div className="section-heading"><div><h3>Grade mappings</h3><p>Edit grade names and their numeric school grades inline.</p></div></div><EditTable ariaLabel="Contest grade mappings" columns={gradeColumns} rows={grades} reorderable onRowsReorder={rows => setList("grades", rows)} onRowChange={(index, field, value) => update("grades", index, field === "grades" ? { grades: (value as string[]).map(Number).sort((a, b) => a - b) } : { gradeName: String(value) })} onRowAdd={() => add("grades", { gradeName: "", grades: [] })} onRowDelete={index => remove("grades", index)} addLabel="Add grade" emptyText="No grade mappings yet." /></>)}
      {isContestTopic && renderSection("categories", "Question categories", "Normalized names and source matching patterns.", <EditTable ariaLabel="Question categories" columns={categoryColumns} rows={categories} reorderable onRowsReorder={rows => setList("categories", rows)} onRowChange={(index, field, value) => { if (field === "roundCodes") update("categories", index, { roundCodes: (value as string[]).map(code => code.toUpperCase()) }); else if (field === "patterns") update("categories", index, { patterns: parseStrings(String(value)) }); else if (field === "roundHint") update("categories", index, { roundHint: String(value).trim() || undefined }); else update("categories", index, { categoryName: String(value) }) }} onRowAdd={() => add("categories", { categoryName: "", roundCodes: [], patterns: [] })} onRowDelete={index => remove("categories", index)} addLabel="Add category" emptyText="No categories yet." />)}
      {isContestTopic && renderSection("rules", "Quiz rules", "Timing, scoring, and category breakdowns.", <DataTable ariaLabel="Quiz rules" rows={rules} columns={ruleColumns} rowKey={(_rule, index) => String(index)} emptyText="No quiz rules yet." footer={<button type="button" className="ui-data-table-add" onClick={() => setRuleEditor("create")}><Plus />Add rule</button>} />)}
    </div>
    {ruleEditor !== null && <RuleEditorDrawer rule={ruleEditor === "create" ? { roundCode: "", gradeNames: ["*"], totalQuestions: 1, totalPoints: 0, initPoints: 0, timeLimit: 0, answerType: 0, categories: [] } : rules[ruleEditor]} rounds={rounds} grades={grades} onClose={() => setRuleEditor(null)} onSave={rule => { if (ruleEditor === "create") add("quizRules", rule); else update("quizRules", ruleEditor, rule); setRuleEditor(null) }} />}
  </DialogFrame>
}
