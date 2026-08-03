import { useEffect, useState, type ReactNode } from "react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionProposalResult } from "../core/models"
import { QuizCodeEditor } from "./QuizCodeEditor"
import { AccordionSection } from "./ui/Accordion"

type StoredAiResponse = DynamicQuestionProposalResult & { generatedAt: string }
type SectionId = "summary" | "parameters" | "params-code" | "question-code" | "explanation-code" | "origin-code" | "request" | "usage"

function Code({ children }: { children: string }) {
  return <pre className="ai-response-code">{children}</pre>
}

function GeneratedCode({ source, field, responseId }: { source: string; field: "params" | "question" | "explanation" | "origin"; responseId: string }) {
  const [formatted, setFormatted] = useState(source)
  useEffect(() => {
    let active = true
    const expression = field === "origin" ? `(${source})` : source
    void QuizTsService.formatSnippet(expression).then(value => {
      if (!active) return
      const clean = value.trim().replace(/^;\s*/, "")
      setFormatted(field === "origin" ? clean.replace(/^\(\s*/, "").replace(/\s*\)$/, "") : clean)
    }).catch(() => { if (active) setFormatted(source) })
    return () => { active = false }
  }, [field, source])
  return <div className="ai-response-code-viewer"><QuizCodeEditor value={formatted} path={`ai-response/${responseId}-${field}.ts`} readOnly autoHeight minHeight={100} onChange={() => undefined} onSave={() => undefined} /></div>
}

export function AiResponsePanel({ response }: { response: StoredAiResponse }) {
  const [expanded, setExpanded] = useState<Set<SectionId>>(() => new Set(["summary"]))
  const { proposal, request, usage } = response
  const section = (id: SectionId, title: string, children: ReactNode, description?: string, collapsible = true) => <AccordionSection key={id} variant="panel" title={title} description={description} collapsible={collapsible} expanded={expanded.has(id)} onExpandedChange={open => setExpanded(current => {
    const next = new Set(current)
    if (open) next.add(id)
    else next.delete(id)
    return next
  })}>{children}</AccordionSection>

  return <div className="ai-response-accordion" aria-label="AI response">
    {section("summary", "AI Generated Summary", <div className="ai-response-summary-panel">
      <section><strong>Model</strong><p>{response.model}</p></section>
      <section><strong>Confidence</strong><p>{Math.round(proposal.confidence * 1000) / 10}%</p></section>
      <section><strong>Total tokens</strong><p>{usage.totalTokens.toLocaleString()}</p></section>
      <section className="wide"><strong>Explanation</strong><p>{proposal.explanation}</p></section>
      {proposal.warnings.length > 0 && <section className="wide warning"><strong>Warnings</strong><ul>{proposal.warnings.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}
      {proposal.assumptions.length > 0 && <section className="wide"><strong>Assumptions</strong><ul>{proposal.assumptions.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}
    </div>, `Generated ${new Date(response.generatedAt).toLocaleString()}`, false)}
    {proposal.parameterizedValues.length > 0 && section("parameters", "Parameterized values", <div className="ai-parameter-list">{proposal.parameterizedValues.map((value, index) => <div key={`${value.parameter}-${index}`}><code>{value.original}</code><span>→</span><code>{value.parameter}</code><p>{value.reason}</p></div>)}</div>, `${proposal.parameterizedValues.length} value${proposal.parameterizedValues.length === 1 ? "" : "s"}`)}
    {section("params-code", "Parameters generator", <GeneratedCode source={proposal.paramsGeneratorTs} field="params" responseId={response.generatedAt} />)}
    {section("question-code", "Question generator", <GeneratedCode source={proposal.questionGeneratorTs} field="question" responseId={response.generatedAt} />)}
    {section("explanation-code", "Explanation generator", <GeneratedCode source={proposal.explanationGeneratorTs} field="explanation" responseId={response.generatedAt} />)}
    {section("origin-code", "Original parameters", <GeneratedCode source={proposal.originParamsTs} field="origin" responseId={response.generatedAt} />)}
    {request && section("request", "Request", <div className="ai-response-request"><strong>Instructions</strong><p>{request.administratorInstructions}</p>{request.context && <><strong>Quiz context</strong><Code>{JSON.stringify(request.context, null, 2)}</Code></>}<strong>Question payload</strong><Code>{JSON.stringify(request.question, null, 2)}</Code><span>{request.task} · {request.currentDate}</span></div>)}
    {section("usage", "Token usage", <Code>{JSON.stringify(usage, null, 2)}</Code>)}
  </div>
}
