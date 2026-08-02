import { useEffect, useMemo, useState } from "react"
import { History, Zap } from "lucide-react"
import { QuizTsService, createDynamicQuestionBuildService } from "@tnp/getgo-logics/authoring"
import { QuizBuilder, QuizValueSerializer } from "@tnp/getgo-logics/quiz-builder"
import type { QuizQuestionRecord } from "../core/models"
import { QuizCodeEditor } from "./QuizCodeEditor"
import { Panel } from "./ui/Panel"

async function sha256(source: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)); return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("") }
const builder = createDynamicQuestionBuildService({ createBuilder: () => new QuizBuilder(), serialize: value => QuizValueSerializer.serialize(value), deserialize: value => QuizValueSerializer.deserialize(value), hash: sha256 })

interface RuntimeQuestion extends Record<string, unknown> { question_no: number; category?: string; text_en: unknown; text_vn?: unknown; image_datas?: string[]; answer: { type: string; correct: string | number | string[]; choices?: Record<string, unknown>; unit?: string } }
const text = (value: unknown) => Array.isArray(value) ? value.join(" ") : String(value ?? "")

function QuestionPreview({ question, params, both }: { question: RuntimeQuestion; params: Record<string, unknown>; both: boolean }) {
  const choices = Object.entries(question.answer?.choices ?? {})
  const englishText = text(question.text_en)
  const vietnameseText = text(question.text_vn)
  const hasBilingualContent = englishText.trim().length > 0 && vietnameseText.trim().length > 0
  return <div className="question-preview">
    <div className="question-preview-content"><p>{englishText}</p>{both && hasBilingualContent && <p className="question-preview-translation">{vietnameseText}</p>}
      {question.image_datas?.map((image, index) => <div className="question-preview-image" key={`${image}-${index}`}>{image.startsWith("data:") ? <img src={image} alt="Question illustration" /> : image}</div>)}
      {choices.length ? <div className="question-preview-choices">{choices.map(([label, value]) => <div className={String(question.answer.correct) === label ? "is-correct" : ""} key={label}><b>{label}.</b><span>{text(value)}</span></div>)}</div> : <div className="question-preview-answer"><span>Correct answer</span><strong>{text(question.answer?.correct)}{question.answer?.unit ? ` ${question.answer.unit}` : ""}</strong></div>}
    </div><div className="question-preview-params"><span>Generated parameters</span><code>{JSON.stringify(params)}</code></div>
  </div>
}

export function AdvancedQuestionEditor({ record, path, onChange, onSave }: { record: QuizQuestionRecord; path: string; onChange(record: QuizQuestionRecord): void; onSave(): void }) {
  const source = useMemo(() => QuizTsService.composeTemplateSource(record.advancedDynamic!), [record.advancedDynamic])
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<{ question: RuntimeQuestion; params: Record<string, unknown> }>({ question: record as unknown as RuntimeQuestion, params: { __dynamic: true } })
  const [bothLanguages, setBothLanguages] = useState(true)
  const sections = useMemo(() => { try { return QuizTsService.getTemplateEditorSections(source) } catch { try { return QuizTsService.getTemplateEditorSectionsRecovering(source) } catch { return [] } } }, [source])
  const updateSource = (next: string) => { try { const fields = QuizTsService.extractTemplateSourceFields(next); onChange({ ...record, advancedDynamic: { ...record.advancedDynamic!, paramsGeneratorTs: fields.paramsGeneratorTs.trim(), questionGeneratorTs: fields.questionGeneratorTs.trim(), originParamsTs: fields.originParamsTs?.trim() ?? "", explanationGeneratorTs: fields.explanationGeneratorTs?.trim() ?? "" } }) } catch { /* Retain the last structurally valid callback document while typing. */ } }
  const updateField = (key: "paramsGeneratorTs" | "questionGeneratorTs" | "explanationGeneratorTs" | "originParamsTs", value: string) => onChange({ ...record, advancedDynamic: { ...record.advancedDynamic!, [key]: value } })
  useEffect(() => {
    let active = true
    const advanced = record.advancedDynamic!
    void Promise.all((["paramsGeneratorTs", "questionGeneratorTs", "explanationGeneratorTs", "originParamsTs"] as const).map(async key => [key, advanced[key].trim() ? (await QuizTsService.formatSnippet(advanced[key])).trim().replace(/^;(?=\s*(?:\(|function\b))/, "") : ""] as const)).then(entries => {
      if (!active) return
      const formatted = { ...advanced, ...Object.fromEntries(entries) }
      if (JSON.stringify(formatted) !== JSON.stringify(advanced)) onChange({ ...record, advancedDynamic: formatted })
    }).catch(() => { /* Preserve invalid drafts so the editor can report them. */ })
    return () => { active = false }
  }, [path])
  useEffect(() => { const timeout = window.setTimeout(() => { try { const next = QuizTsService.syncQuestionGeneratorSignature(source); if (next !== source) updateSource(next) } catch { /* incomplete source */ } }, 400); return () => window.clearTimeout(timeout) })
  const generate = async (original = false) => { try { const generated = original ? await builder.generateOriginal(source) : await builder.generate(source); if (generated) { setPreview(generated as { question: RuntimeQuestion; params: Record<string, unknown> }); setErrors([]) } } catch (cause) { setErrors([cause instanceof Error ? cause.message : String(cause)]) } }
  const hasBilingualContent = text(preview.question.text_en).trim().length > 0 && text(preview.question.text_vn).trim().length > 0
  const labels = { params: "Parameters generator", question: "Question generator", explanation: "Explanation generator", origin: "Original parameters" }
  const editorFields = ([
    ["params", "paramsGeneratorTs"], ["question", "questionGeneratorTs"], ["explanation", "explanationGeneratorTs"], ["origin", "originParamsTs"],
  ] as const).map(([id, key]) => {
    const value = record.advancedDynamic?.[key] ?? ""
    const section = sections.find(item => item.id === id)
    const lineCount = Math.max(1, value.split("\n").length)
    const editableLineRange = section?.editableStartLineNumber != null && section.editableEndLineNumber != null
      ? { startLineNumber: section.editableStartLineNumber - section.startLineNumber + 1, endLineNumber: section.editableEndLineNumber - section.startLineNumber + 1 }
      : undefined
    return { id, key, value, lineCount, editableLineRange }
  })
  return <div className="advanced-question-layout"><div className="advanced-question-editors">{editorFields.map(field => <section className="advanced-question-field" key={field.id}><strong>{labels[field.id]}</strong><div className="question-code-workspace"><QuizCodeEditor value={field.value} path={`${path}.${field.id}.ts`} autoHeight minHeight={120} visibleLineRange={{ startLineNumber: 1, endLineNumber: field.lineCount }} editableLineRange={field.editableLineRange} relativeLineNumbers onChange={value => updateField(field.key, value)} onSave={onSave} onBlur={field.id === "params" ? () => { try { updateSource(QuizTsService.syncQuestionGeneratorSignature(QuizTsService.composeTemplateSource({ ...record.advancedDynamic!, paramsGeneratorTs: field.value }))) } catch { /* incomplete source */ } } : undefined} onValidate={field.id === "question" ? markers => setErrors(markers.filter(marker => marker.severity === 8).map(marker => `${marker.startLineNumber}:${marker.startColumn} — ${marker.message}`)) : undefined} /></div></section>)}</div>
    <Panel className="question-preview-panel" title={`Question ${preview.question.question_no}`} meta={<span className="question-preview-actions">{hasBilingualContent && <button className="preview-language-toggle" aria-pressed={bothLanguages} aria-label="Preview language" title="Preview language" onClick={() => setBothLanguages(value => !value)}>{bothLanguages ? "EN + VI" : "EN"}</button>}<button title="Regenerate question" aria-label="Regenerate question" onClick={() => void generate()}><Zap size={16} /></button><button title="Generate original question" aria-label="Generate original question" onClick={() => void generate(true)}><History size={16} /></button></span>}><QuestionPreview question={preview.question} params={preview.params} both={bothLanguages} />{errors.length > 0 && <div className="question-editor-errors"><strong>Type or generation error</strong>{errors.map((error, index) => <span key={index}>{error}</span>)}</div>}</Panel>
  </div>
}
