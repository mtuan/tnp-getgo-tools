import { useState, type FormEvent } from "react"
import { BookOpen, Layers3, Plus, Settings2, Tags, Trash2, UsersRound } from "lucide-react"
import type { ContestSettings, ContestSummary } from "../core/models"
import { DialogFrame } from "./CrudDialogs"
import { Form, validateSchema, type FormErrors, type FormSchema, type FormValues } from "./ui/Form"

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
  book: { code: "", title: "", description: "", subject: 1, isActive: true },
  rounds: [{ roundCode: "MAIN", roundName: "Main Round", description: "" }],
  grades: [{ gradeName: "1", grades: [1] }],
  categories: [], quizRules: [],
})

const generalFields: FormSchema[] = [
  { section: "Contest information", description: "Identity and visibility across GetGo.", fields: [
    [
      { type: "text", name: "code", label: "Contest ID", required: true, rules: { pattern: { value: /^[a-z][-a-z0-9]*$/, message: "Use lowercase letters, numbers, and hyphens." } } },
      { type: "text", name: "title", label: "Display title", required: true },
    ],
    { type: "textarea", name: "description", label: "Description", rows: 3 },
    [
      { type: "select", name: "subject", label: "Subject", options: ["Mathematics", "English", "Vietnamese", "Physics", "Chemistry", "Biology", "History", "Geography"].map((label, index) => ({ label, value: String(index + 1) })) },
      { type: "toggle", name: "isActive", label: "Active contest" },
    ],
  ] },
]

const gradeMappingFields: FormSchema[] = [[
  { type: "text", name: "gradeName", label: "Display name", required: true, placeholder: "E.g. Benjamin" },
  { type: "multi-select", name: "grades", label: "School grades", required: true, options: Array.from({ length: 13 }, (_, grade) => ({ value: String(grade), label: grade === 0 ? "Kindergarten" : `Grade ${grade}` })) },
]]

const text = (value: unknown) => typeof value === "string" ? value : ""
const number = (value: unknown, fallback = 0) => typeof value === "number" ? value : fallback
const strings = (value: unknown) => Array.isArray(value) ? value.join(", ") : ""
const parseStrings = (value: string) => value.split(",").map(item => item.trim()).filter(Boolean)

function EmptySection({ label, onAdd }: { label: string; onAdd(): void }) {
  return <div className="settings-empty"><div><Plus /></div><strong>No {label} yet</strong><span>Add the first item to configure this contest.</span><button type="button" className="secondary" onClick={onAdd}><Plus />Add {label.replace(/s$/, "")}</button></div>
}

function ItemHeader({ title, detail, onDelete }: { title: string; detail?: string; onDelete(): void }) {
  return <div className="settings-item-header"><div><strong>{title}</strong>{detail && <span>{detail}</span>}</div><button type="button" onClick={onDelete} aria-label={`Remove ${title}`}><Trash2 /></button></div>
}

export function ContestSettingsDialog({ contest, onClose, onSaved, onDeleted }: { contest?: ContestSummary; onClose(): void; onSaved(settings: ContestSettings): Promise<void>; onDeleted?: () => Promise<void> }) {
  const [settings, setSettings] = useState<ContestSettings>(() => structuredClone(contest?.settings ?? emptySettings()))
  const [tab, setTab] = useState<Tab>("general")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const setBook = (patch: Partial<ContestSettings["book"]>) => setSettings(current => ({ ...current, book: { ...current.book, ...patch } }))
  const setList = (key: "rounds" | "grades" | "categories" | "quizRules", list: Item[]) => setSettings(current => ({ ...current, [key]: list }))
  const update = (key: "rounds" | "grades" | "categories" | "quizRules", index: number, patch: Item) => {
    const list = [...(settings[key] ?? [])] as Item[]; list[index] = { ...list[index], ...patch }; setList(key, list)
  }
  const remove = (key: "rounds" | "grades" | "categories" | "quizRules", index: number) => setList(key, ([...(settings[key] ?? [])] as Item[]).filter((_, itemIndex) => itemIndex !== index))
  const add = (key: "rounds" | "grades" | "categories" | "quizRules", value: Item) => setList(key, [...(settings[key] ?? []), value] as Item[])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    const errors = validateSchema(generalFields, generalValues)
    setFieldErrors(errors)
    if (Object.keys(errors).length) { setTab("general"); return }
    setBusy(true)
    try { await onSaved({ ...settings, $schema: "../settings.schema.json", book: { ...settings.book, code: settings.book.code.trim().toLowerCase(), title: settings.book.title.trim(), description: settings.book.description?.trim() } }) }
    catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  const rounds = settings.rounds as Item[]
  const grades = settings.grades as Item[]
  const categories = (settings.categories ?? []) as Item[]
  const rules = (settings.quizRules ?? []) as Item[]
  const generalValues: FormValues = { code: settings.book.code, title: settings.book.title, description: settings.book.description ?? "", subject: String(settings.book.subject), isActive: settings.book.isActive !== false }
  const updateGeneral = (name: string, value: unknown) => {
    setFieldErrors(current => { const next = { ...current }; delete next[name]; return next })
    if (name === "subject") setBook({ subject: Number(value) })
    else if (name === "isActive") setBook({ isActive: Boolean(value) })
    else if (name === "code" || name === "title" || name === "description") setBook({ [name]: String(value) })
  }
  return <DialogFrame title={contest ? "Edit contest" : "Create contest"} submitLabel={contest ? "Save" : "Create"} busy={busy} error={error} onClose={onClose} onSubmit={submit} onDelete={onDeleted ? async () => { setBusy(true); try { await onDeleted() } catch (cause) { setBusy(false); setError(cause instanceof Error ? cause.message : String(cause)) } } : undefined}>
    {contest && <div className="settings-tabs" role="tablist">{tabs.map(item => { const Icon = item.icon; const count = item.id === "rounds" ? rounds.length : item.id === "grades" ? grades.length : item.id === "categories" ? categories.length : item.id === "rules" ? rules.length : null; return <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)} key={item.id}><Icon />{item.label}{count !== null && <i>{count}</i>}</button> })}</div>}
    <div className="settings-tab-content" key={tab}>
      {tab === "general" && <Form fields={generalFields.map(entry => "section" in entry ? { ...entry, fields: entry.fields.map(row => Array.isArray(row) ? row.map(field => field.name === "code" ? { ...field, readOnly: Boolean(contest) } : field) : row.name === "code" ? { ...row, readOnly: Boolean(contest) } : row) } : entry)} values={generalValues} errors={fieldErrors} onChange={updateGeneral} />}
      {tab === "rounds" && <><div className="section-heading"><div><h3>Contest rounds</h3><p>Stages and practice availability.</p></div><button type="button" className="secondary" onClick={() => add("rounds", { roundCode: "", roundName: "", description: "", hasPractice: false })}><Plus />Add round</button></div>{!rounds.length ? <EmptySection label="rounds" onAdd={() => add("rounds", { roundCode: "", roundName: "" })} /> : <div className="settings-list">{rounds.map((round, index) => <article className="settings-item" key={index}><ItemHeader title={text(round.roundName) || `Round ${index + 1}`} detail={text(round.roundCode)} onDelete={() => remove("rounds", index)} /><div className="field-grid"><label>Code<input required placeholder="PR" value={text(round.roundCode)} onChange={event => update("rounds", index, { roundCode: event.target.value.toUpperCase() })} /></label><label>Name<input required placeholder="Preliminary Round" value={text(round.roundName)} onChange={event => update("rounds", index, { roundName: event.target.value })} /></label></div><label>Description<input value={text(round.description)} onChange={event => update("rounds", index, { description: event.target.value })} /></label><label className="inline-toggle"><input type="checkbox" checked={round.hasPractice === true} onChange={event => update("rounds", index, { hasPractice: event.target.checked })} />Practice mode available</label></article>)}</div>}</>}
      {tab === "grades" && <><div className="section-heading"><div><h3>Grade mappings</h3><p>Display levels mapped to numeric school grades.</p></div><button type="button" className="secondary" onClick={() => add("grades", { gradeName: "", grades: [] })}><Plus />Add grade</button></div>{!grades.length ? <EmptySection label="grades" onAdd={() => add("grades", { gradeName: "", grades: [] })} /> : <div className="settings-list">{grades.map((grade, index) => <article className="settings-item compact" key={index}><ItemHeader title={text(grade.gradeName) || `Grade ${index + 1}`} detail={strings(grade.grades)} onDelete={() => remove("grades", index)} /><Form autoFocus={false} fields={gradeMappingFields} values={{ gradeName: text(grade.gradeName), grades: Array.isArray(grade.grades) ? grade.grades.map(String) : [] }} onChange={(name, value) => update("grades", index, name === "grades" ? { grades: (value as string[]).map(Number).sort((a, b) => a - b) } : { gradeName: String(value) })} /></article>)}</div>}</>}
      {tab === "categories" && <><div className="section-heading"><div><h3>Question categories</h3><p>Normalized names and source matching patterns.</p></div><button type="button" className="secondary" onClick={() => add("categories", { categoryName: "", roundCodes: [], patterns: [] })}><Plus />Add category</button></div>{!categories.length ? <EmptySection label="categories" onAdd={() => add("categories", { categoryName: "", roundCodes: [], patterns: [] })} /> : <div className="settings-list">{categories.map((category, index) => <article className="settings-item" key={index}><ItemHeader title={text(category.categoryName) || `Category ${index + 1}`} detail={strings(category.roundCodes)} onDelete={() => remove("categories", index)} /><label>Category name<input required value={text(category.categoryName)} onChange={event => update("categories", index, { categoryName: event.target.value })} /></label><div className="field-grid"><label>Round codes<input placeholder="PR, HR, FR" value={strings(category.roundCodes)} onChange={event => update("categories", index, { roundCodes: parseStrings(event.target.value).map(value => value.toUpperCase()) })} /></label><label>Round hint<input value={text(category.roundHint)} onChange={event => update("categories", index, { roundHint: event.target.value || undefined })} /></label></div><label>Matching patterns <span className="label-help">Comma separated</span><input placeholder="ARITHMETIC, ALGEBRA, SỐ HỌC" value={strings(category.patterns)} onChange={event => update("categories", index, { patterns: parseStrings(event.target.value) })} /></label></article>)}</div>}</>}
      {tab === "rules" && <><div className="section-heading"><div><h3>Quiz rules</h3><p>Timing, scoring, and category breakdowns.</p></div><button type="button" className="secondary" onClick={() => add("quizRules", { roundCode: "", gradeNames: ["*"], totalQuestions: 1, totalPoints: 0, initPoints: 0, timeLimit: 0, answerType: 0, categories: [] })}><Plus />Add rule</button></div>{!rules.length ? <EmptySection label="rules" onAdd={() => add("quizRules", { roundCode: "", gradeNames: ["*"], totalQuestions: 1, totalPoints: 0, timeLimit: 0, answerType: 0, categories: [] })} /> : <div className="settings-list">{rules.map((rule, index) => { const breakdown = (Array.isArray(rule.categories) ? rule.categories : []) as Item[]; const updateBreakdown = (next: Item[]) => update("quizRules", index, { categories: next }); return <article className="settings-item rule-item" key={index}><ItemHeader title={`${text(rule.roundCode) || "New"} rule`} detail={`${number(rule.totalQuestions, 1)} questions · ${number(rule.timeLimit) / 60} min`} onDelete={() => remove("quizRules", index)} /><div className="field-grid three"><label>Round<input required value={text(rule.roundCode)} onChange={event => update("quizRules", index, { roundCode: event.target.value.toUpperCase() })} /></label><label>Grades<input required value={strings(rule.gradeNames)} onChange={event => update("quizRules", index, { gradeNames: parseStrings(event.target.value) })} /></label><label>Answer type<select value={number(rule.answerType)} onChange={event => update("quizRules", index, { answerType: Number(event.target.value) })}><option value="0">Multiple choice</option><option value="1">Input</option><option value="2">Mixed</option></select></label></div><div className="field-grid four"><label>Questions<input type="number" min="1" value={number(rule.totalQuestions, 1)} onChange={event => update("quizRules", index, { totalQuestions: Number(event.target.value) })} /></label><label>Total points<input type="number" min="0" value={number(rule.totalPoints)} onChange={event => update("quizRules", index, { totalPoints: Number(event.target.value) })} /></label><label>Initial points<input type="number" min="0" value={number(rule.initPoints)} onChange={event => update("quizRules", index, { initPoints: Number(event.target.value) })} /></label><label>Time (seconds)<input type="number" min="0" value={number(rule.timeLimit)} onChange={event => update("quizRules", index, { timeLimit: Number(event.target.value) })} /></label></div><div className="breakdown-heading"><strong>Scoring categories</strong><button type="button" onClick={() => updateBreakdown([...breakdown, { categoryName: "", categoryNo: breakdown.length + 1, questionCount: 0, correctPoints: 0, wrongPoints: 0, noAnswerPoints: 0 }])}><Plus />Add</button></div>{breakdown.map((category, categoryIndex) => <div className="breakdown-row" key={categoryIndex}><input aria-label="Category name" placeholder="Category" value={text(category.categoryName)} onChange={event => { const next = [...breakdown]; next[categoryIndex] = { ...category, categoryName: event.target.value }; updateBreakdown(next) }} /><input aria-label="Question count" type="number" title="Question count" value={number(category.questionCount)} onChange={event => { const next = [...breakdown]; next[categoryIndex] = { ...category, questionCount: Number(event.target.value) }; updateBreakdown(next) }} /><input aria-label="Correct points" type="number" title="Correct points" value={number(category.correctPoints)} onChange={event => { const next = [...breakdown]; next[categoryIndex] = { ...category, correctPoints: Number(event.target.value) }; updateBreakdown(next) }} /><input aria-label="Wrong points" type="number" title="Wrong points" value={number(category.wrongPoints)} onChange={event => { const next = [...breakdown]; next[categoryIndex] = { ...category, wrongPoints: Number(event.target.value) }; updateBreakdown(next) }} /><button type="button" onClick={() => updateBreakdown(breakdown.filter((_, i) => i !== categoryIndex))}><Trash2 /></button></div>)}</article> })}</div>}</>}
    </div>
  </DialogFrame>
}
