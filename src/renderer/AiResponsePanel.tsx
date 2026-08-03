import { useState, type ReactNode } from "react"
import type { DynamicQuestionProposalResult } from "../core/models"
import { AccordionSection } from "./ui/Accordion"

type StoredAiResponse = DynamicQuestionProposalResult & { generatedAt: string }
type SectionId = "summary" | "parameters" | "params-code" | "question-code" | "explanation-code" | "origin-code" | "request" | "usage"

function Code({ children }: { children: string }) {
  return <pre className="ai-response-code">{children}</pre>
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
    {section("params-code", "Parameters generator", <Code>{proposal.paramsGeneratorTs}</Code>)}
    {section("question-code", "Question generator", <Code>{proposal.questionGeneratorTs}</Code>)}
    {section("explanation-code", "Explanation generator", <Code>{proposal.explanationGeneratorTs}</Code>)}
    {section("origin-code", "Original parameters", <Code>{proposal.originParamsTs}</Code>)}
    {request && section("request", "Request", <div className="ai-response-request"><strong>Instructions</strong><p>{request.administratorInstructions}</p>{request.context && <><strong>Quiz context</strong><Code>{JSON.stringify(request.context, null, 2)}</Code></>}<strong>Question payload</strong><Code>{JSON.stringify(request.question, null, 2)}</Code><span>{request.task} · {request.currentDate}</span></div>)}
    {section("usage", "Token usage", <Code>{JSON.stringify(usage, null, 2)}</Code>)}
  </div>
}
