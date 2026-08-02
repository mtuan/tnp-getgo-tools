import { useEffect, useMemo, useState } from "react"
import { History, RefreshCw } from "lucide-react"
import { QuizTsService, createDynamicQuestionBuildService } from "@tnp/getgo-logics/authoring"
import { QuizBuilder, QuizValueSerializer } from "@tnp/getgo-logics/quiz-builder"
import type { QuizQuestionRecord } from "../core/models"
import { QuizCodeEditor } from "./QuizCodeEditor"
import { Button } from "./ui/Button"
import { Panel } from "./ui/Panel"

async function sha256(source: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)); return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("") }
const builder = createDynamicQuestionBuildService({ createBuilder: () => new QuizBuilder(), serialize: value => QuizValueSerializer.serialize(value), deserialize: value => QuizValueSerializer.deserialize(value), hash: sha256 })

interface RuntimeQuestion extends Record<string, unknown> { question_no: number; category?: string; text_en: unknown; text_vn?: unknown; image_datas?: string[]; answer: { type: string; correct: string | number | string[]; choices?: Record<string, unknown>; unit?: string } }
const text = (value: unknown) => Array.isArray(value) ? value.join(" ") : String(value ?? "")

function QuestionPreview({ question, params, onRegenerate, onOriginal }: { question: RuntimeQuestion; params: Record<string, unknown>; onRegenerate(): void; onOriginal(): void }) {
  const [both, setBoth] = useState(true)
  const choices = Object.entries(question.answer?.choices ?? {})
  return <div className="question-preview">
    <div className="question-preview-toolbar"><strong>Question {question.question_no}</strong><div><button onClick={() => setBoth(value => !value)}>{both ? "English + Vietnamese" : "English"}</button><button title="Regenerate question" aria-label="Regenerate question" onClick={onRegenerate}><RefreshCw size={16} /></button><button title="Generate original question" aria-label="Generate original question" onClick={onOriginal}><History size={16} /></button></div></div>
    <div className="question-preview-content"><p>{text(question.text_en)}</p>{both && question.text_vn != null && <p className="question-preview-translation">{text(question.text_vn)}</p>}
      {question.image_datas?.map((image, index) => <div className="question-preview-image" key={`${image}-${index}`}>{image.startsWith("data:") ? <img src={image} alt="Question illustration" /> : image}</div>)}
      {choices.length ? <div className="question-preview-choices">{choices.map(([label, value]) => <div className={String(question.answer.correct) === label ? "is-correct" : ""} key={label}><b>{label}.</b><span>{text(value)}</span></div>)}</div> : <div className="question-preview-answer"><span>Correct answer</span><strong>{text(question.answer?.correct)}{question.answer?.unit ? ` ${question.answer.unit}` : ""}</strong></div>}
    </div><div className="question-preview-params"><span>Generated parameters</span><code>{JSON.stringify(params)}</code></div>
  </div>
}

export function AdvancedQuestionEditor({ record, path, onChange, onSave }: { record: QuizQuestionRecord; path: string; onChange(record: QuizQuestionRecord): void; onSave(): void }) {
  const source = useMemo(() => QuizTsService.composeTemplateSource(record.advancedDynamic!), [record.advancedDynamic])
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<{ question: RuntimeQuestion; params: Record<string, unknown> }>({ question: record as unknown as RuntimeQuestion, params: { __dynamic: true } })
  const sections = useMemo(() => { try { return QuizTsService.getTemplateEditorSections(source) } catch { try { return QuizTsService.getTemplateEditorSectionsRecovering(source) } catch { return [] } } }, [source])
  const updateSource = (next: string) => { try { onChange({ ...record, advancedDynamic: { ...record.advancedDynamic!, ...QuizTsService.extractTemplateSourceFields(next) } }) } catch { /* Retain the last structurally valid callback document while typing. */ } }
  useEffect(() => { const timeout = window.setTimeout(() => { try { const next = QuizTsService.syncQuestionGeneratorSignature(source); if (next !== source) updateSource(next) } catch { /* incomplete source */ } }, 400); return () => window.clearTimeout(timeout) })
  const generate = async (original = false) => { try { const generated = original ? await builder.generateOriginal(source) : await builder.generate(source); if (generated) { setPreview(generated as { question: RuntimeQuestion; params: Record<string, unknown> }); setErrors([]) } } catch (cause) { setErrors([cause instanceof Error ? cause.message : String(cause)]) } }
  const labels = { params: "Parameters generator", question: "Question generator", explanation: "Explanation generator", origin: "Original parameters" }
  return <div className="advanced-question-layout"><div className="advanced-question-editors">{sections.map(section => <section className="advanced-question-field" key={section.id}><strong>{labels[section.id]}</strong><div className="question-code-workspace"><QuizCodeEditor value={source} path={`${path}.${section.id}.ts`} autoHeight minHeight={120} visibleLineRange={section} editableLineRange={section.editableStartLineNumber != null ? { startLineNumber: section.editableStartLineNumber, endLineNumber: section.editableEndLineNumber! } : undefined} relativeLineNumbers onChange={updateSource} onSave={onSave} onBlur={section.id === "params" ? () => { try { updateSource(QuizTsService.syncQuestionGeneratorSignature(source)) } catch { /* incomplete source */ } } : undefined} onValidate={section.id === "question" ? markers => setErrors(markers.filter(marker => marker.severity === 8).map(marker => `${marker.startLineNumber}:${marker.startColumn} — ${marker.message}`)) : undefined} /></div></section>)}</div>
    <Panel className="question-preview-panel" title="Question preview" meta={<Button onClick={() => void generate()}><RefreshCw size={15} />Preview</Button>}><QuestionPreview question={preview.question} params={preview.params} onRegenerate={() => void generate()} onOriginal={() => void generate(true)} />{errors.length > 0 && <div className="question-editor-errors"><strong>Type or generation error</strong>{errors.map((error, index) => <span key={index}>{error}</span>)}</div>}</Panel>
  </div>
}
