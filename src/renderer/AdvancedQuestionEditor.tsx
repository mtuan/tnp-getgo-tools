import { useEffect, useMemo, useRef, useState } from "react"
import { History, Zap } from "lucide-react"
import { QuizTsService, createDynamicQuestionBuildService } from "@tnp/getgo-logics/authoring"
import { QuizBuilder, QuizValueSerializer } from "@tnp/getgo-logics/quiz-builder"
import type { QuizQuestionRecord } from "../core/models"
import { QuizCodeEditor } from "./QuizCodeEditor"
import { AiResponsePanel } from "./AiResponsePanel"
import { DynamicQuestionAi } from "./DynamicQuestionAi"
import { Panel } from "./ui/Panel"

async function sha256(source: string): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)); return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("") }
const builder = createDynamicQuestionBuildService({ createBuilder: () => new QuizBuilder(), serialize: value => QuizValueSerializer.serialize(value), deserialize: value => QuizValueSerializer.deserialize(value), hash: sha256 })

interface RuntimeQuestion extends Record<string, unknown> { question_no: number; category?: string; text_en: unknown; text_vn?: unknown; image_datas?: string[]; explanation?: { en?: unknown; vi?: unknown }; answer: { type: string; correct: string | number | string[]; choices?: Record<string, unknown>; unit?: string } }
const text = (value: unknown) => Array.isArray(value) ? value.join(" ") : String(value ?? "")
const formatStandaloneField = async (value: string) => value.trim() ? (await QuizTsService.formatSnippet(value)).trim().replace(/^;(?=\s*(?:\(|function\b))/, "") : ""

function QuestionPreview({ question, params }: { question: RuntimeQuestion; params: Record<string, unknown> }) {
  const choices = Object.entries(question.answer?.choices ?? {})
  const englishText = text(question.text_en)
  const vietnameseText = text(question.text_vn)
  const englishExplanation = text(question.explanation?.en)
  const vietnameseExplanation = text(question.explanation?.vi)
  const hasExplanation = englishExplanation.trim().length > 0 || vietnameseExplanation.trim().length > 0
  return <div className="question-preview">
    <div className="question-preview-content">{englishText.trim() && <p>{englishText}</p>}{vietnameseText.trim() && <p className="question-preview-translation">{vietnameseText}</p>}
      {question.image_datas?.map((image, index) => <div className="question-preview-image" key={`${image}-${index}`}>{image.startsWith("data:") ? <img src={image} alt="Question illustration" /> : image}</div>)}
      {choices.length ? <div className="question-preview-choices">{choices.map(([label, value]) => <div className={String(question.answer.correct) === label ? "is-correct" : ""} key={label}><b>{label}.</b><span>{text(value)}</span></div>)}</div> : <div className="question-preview-answer"><span>Correct answer</span><strong>{text(question.answer?.correct)}{question.answer?.unit ? ` ${question.answer.unit}` : ""}</strong></div>}
      {hasExplanation && <section className="question-preview-explanation"><strong>Explanation</strong>{englishExplanation.trim() && <p>{englishExplanation}</p>}{vietnameseExplanation.trim() && <p className="question-preview-translation">{vietnameseExplanation}</p>}</section>}
    </div><div className="question-preview-params"><span>Generated parameters</span><code>{JSON.stringify(params)}</code></div>
  </div>
}

export function AdvancedQuestionEditor({ record, path, context, onChange, onSave }: { record: QuizQuestionRecord; path: string; context: Record<string, unknown>; onChange(record: QuizQuestionRecord): void; onSave(): void }) {
  const source = useMemo(() => QuizTsService.composeTemplateSource(record.advancedDynamic!), [record.advancedDynamic])
  const [errors, setErrors] = useState<string[]>([])
  const [preview, setPreview] = useState<{ question: RuntimeQuestion; params: Record<string, unknown> }>({ question: record as unknown as RuntimeQuestion, params: { __dynamic: true } })
  const generatedQuestionRef = useRef<string | number | null>(null)
  const updateField = (key: "paramsGeneratorTs" | "questionGeneratorTs" | "explanationGeneratorTs" | "originParamsTs", value: string) => onChange({ ...record, advancedDynamic: { ...record.advancedDynamic!, [key]: value } })
  const generate = async (original = false) => { try { const generated = original ? await builder.generateOriginal(source) : await builder.generate(source); if (generated) { setPreview(generated as { question: RuntimeQuestion; params: Record<string, unknown> }); setErrors([]) } } catch (cause) { setErrors([cause instanceof Error ? cause.message : String(cause)]) } }
  useEffect(() => {
    if (generatedQuestionRef.current === record.question_no) return
    generatedQuestionRef.current = record.question_no
    void generate()
  }, [record.question_no])
  const labels = { params: "Parameters generator", question: "Question generator", explanation: "Explanation generator", origin: "Original parameters" }
  const editorFields = ([
    ["params", "paramsGeneratorTs"], ["question", "questionGeneratorTs"], ["explanation", "explanationGeneratorTs"], ["origin", "originParamsTs"],
  ] as const).map(([id, key]) => {
    const value = record.advancedDynamic?.[key] ?? ""
    let section
    try {
      const isolatedSource = QuizTsService.composeTemplateSource({
        paramsGeneratorTs: key === "paramsGeneratorTs" ? value : "() => {\n  return {}\n}",
        questionGeneratorTs: key === "questionGeneratorTs" ? value : "({}) => {\n  return {} as never\n}",
        explanationGeneratorTs: key === "explanationGeneratorTs" ? value : "({}) => {\n  return { en: '', vi: '' }\n}",
        originParamsTs: key === "originParamsTs" ? value : "{}",
      })
      section = QuizTsService.getTemplateEditorSections(isolatedSource).find(item => item.id === id)
    } catch { /* An invalid field must not affect any other editor. */ }
    const lineCount = Math.max(1, value.split("\n").length)
    const editableLineRange = section?.editableStartLineNumber != null && section.editableEndLineNumber != null
      ? { startLineNumber: section.editableStartLineNumber - section.startLineNumber + 1, endLineNumber: section.editableEndLineNumber - section.startLineNumber + 1 }
      : undefined
    return { id, key, value, lineCount, editableLineRange, expressionContext: id === "origin" }
  })
  return <div className="advanced-question-layout"><div className="advanced-question-editors">{editorFields.map(field => <section className="advanced-question-field" key={field.id}><strong>{labels[field.id]}</strong><div className="question-code-workspace"><QuizCodeEditor value={field.value} path={`${path}.${field.id}.ts`} autoHeight minHeight={120} visibleLineRange={{ startLineNumber: 1, endLineNumber: field.lineCount }} editableLineRange={field.editableLineRange} expressionContext={field.expressionContext} relativeLineNumbers formatOnMount={formatStandaloneField} onChange={value => updateField(field.key, value)} onSave={onSave} onValidate={field.id === "question" ? markers => setErrors(markers.filter(marker => marker.severity === 8).map(marker => `${marker.startLineNumber}:${marker.startColumn} — ${marker.message}`)) : undefined} /></div></section>)}</div>
    <div className="advanced-question-sidebar"><Panel className="question-preview-panel" title={`Question ${preview.question.question_no}`} meta={<span className="question-preview-actions"><button title="Regenerate question" aria-label="Regenerate question" onClick={() => void generate()}><Zap size={16} /></button><button title="Generate original question" aria-label="Generate original question" onClick={() => void generate(true)}><History size={16} /></button></span>}><QuestionPreview question={preview.question} params={preview.params} />{errors.length > 0 && <div className="question-editor-errors"><strong>Type or generation error</strong>{errors.map((error, index) => <span key={index}>{error}</span>)}</div>}</Panel><DynamicQuestionAi record={record} context={context} diagnostics={errors} onApply={onChange} />{record.aiResponse && <AiResponsePanel response={record.aiResponse} />}</div>
  </div>
}
