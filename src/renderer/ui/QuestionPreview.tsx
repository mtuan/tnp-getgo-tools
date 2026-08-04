import { useEffect, useState } from "react"
import type { RuntimeQuestion } from "../question-service"

export type { RuntimeQuestion } from "../question-service"

export const questionText = (value: unknown) => Array.isArray(value) ? value.join(" ") : String(value ?? "")

function PreviewAsset({ manifestPath, value, alt }: { manifestPath: string; value: string; alt: string }) {
  const [source, setSource] = useState(value.startsWith("data:image/") ? value : "")
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setFailed(false)
    if (value.startsWith("data:image/")) { setSource(value); return () => { active = false } }
    setSource("")
    void window.getgo.readQuizAsset(manifestPath, value).then(result => { if (active) setSource(result) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [manifestPath, value])
  if (failed) return <span className="question-preview-asset-error">Could not load {value}</span>
  return source ? <img src={source} alt={alt} /> : <span className="mini-spinner" aria-label={`Loading ${alt}`} />
}

function PreviewValue({ manifestPath, value, alt }: { manifestPath: string; value: unknown; alt: string }) {
  if (Array.isArray(value)) return <>{value.map((item, index) => <PreviewValue key={index} manifestPath={manifestPath} value={item} alt={alt} />)}</>
  if (typeof value === "string" && (value.startsWith("asset:") || value.startsWith("data:image/"))) return <PreviewAsset manifestPath={manifestPath} value={value} alt={alt} />
  return <>{questionText(value)}</>
}

export function QuestionPreview({ question, params, manifestPath }: { question: RuntimeQuestion; params?: Record<string, unknown>; manifestPath: string }) {
  const choices = Object.entries(question.answer?.choices ?? {})
  const correct = Array.isArray(question.answer?.correct) ? question.answer.correct.map(String) : [String(question.answer?.correct ?? "")]
  const englishText = questionText(question.text_en)
  const vietnameseText = questionText(question.text_vn)
  const englishExplanation = questionText(question.explanation?.en)
  const vietnameseExplanation = questionText(question.explanation?.vi)
  const hasExplanation = englishExplanation.trim().length > 0 || vietnameseExplanation.trim().length > 0
  return <div className="question-preview">
    <div className="question-preview-content">{englishText.trim() && <p>{englishText}</p>}{vietnameseText.trim() && <p className="question-preview-translation">{vietnameseText}</p>}
      {question.image_datas?.map((image, index) => <div className="question-preview-image" key={`${String(image)}-${index}`}><PreviewValue manifestPath={manifestPath} value={image} alt={`Question illustration ${index + 1}`} /></div>)}
      {choices.length ? <div className="question-preview-choices">{choices.map(([label, value]) => <div className={correct.includes(label) ? "is-correct" : ""} key={label}><b>{label}.</b><span><PreviewValue manifestPath={manifestPath} value={value} alt={`Choice ${label}`} />{question.answer.unit && label !== question.answer.otherChoiceKey ? ` ${question.answer.unit}` : ""}</span></div>)}</div> : <div className="question-preview-answer"><span>Correct answer</span><strong>{questionText(question.answer?.correct)}{question.answer?.unit ? ` ${question.answer.unit}` : ""}</strong></div>}
      {hasExplanation && <section className="question-preview-explanation"><strong>Explanation</strong>{englishExplanation.trim() && <p>{englishExplanation}</p>}{vietnameseExplanation.trim() && <p className="question-preview-translation">{vietnameseExplanation}</p>}</section>}
    </div>{params && <div className="question-preview-params"><span>Generated parameters</span><code>{JSON.stringify(params)}</code></div>}
  </div>
}
