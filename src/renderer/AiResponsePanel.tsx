import { useEffect, useMemo, useState, type ReactNode } from "react"
import { History } from "lucide-react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionFixResult, DynamicQuestionProposal, DynamicQuestionProposalResult } from "../core/models"
import { QuizCodeEditor } from "./QuizCodeEditor"
import { AccordionSection } from "./ui/Accordion"
import { Select } from "./ui/Select"

type StoredAiResponse = DynamicQuestionProposalResult & { generatedAt: string }
type StoredAiFix = DynamicQuestionFixResult & { generatedAt: string; proposal?: DynamicQuestionProposal }
type AiRevision = { generatedAt: string; proposal: DynamicQuestionProposal; model: string; request?: Record<string, unknown>; usage: DynamicQuestionProposalResult["usage"]; responseId?: string; kind: "generate" | "fix"; number: number }
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

export function AiResponsePanel({ response, history }: { response: StoredAiResponse; history: StoredAiFix[] }) {
  const [expanded, setExpanded] = useState<Set<SectionId>>(() => new Set(["summary"]))
  const revisions = useMemo<AiRevision[]>(() => {
    let previous = response.proposal
    const fixes = history.map((item, index) => {
      const legacyChanges = Object.fromEntries((item.changes ?? []).map(change => [change.field, change.source]))
      previous = item.proposal ?? { ...previous, ...legacyChanges, explanation: item.explanation || previous.explanation, warnings: item.warnings ?? previous.warnings }
      return { generatedAt: item.generatedAt, proposal: previous, model: item.model, request: item.request, usage: item.usage, responseId: item.responseId, kind: "fix" as const, number: index + 1 }
    })
    return [{ ...response, kind: "generate", number: 0 }, ...fixes]
  }, [history, response])
  const [selectedId, setSelectedId] = useState(() => revisions.at(-1)?.generatedAt ?? response.generatedAt)
  useEffect(() => { setSelectedId(revisions.at(-1)?.generatedAt ?? response.generatedAt) }, [history.length, response.generatedAt])
  const revision = revisions.find(item => item.generatedAt === selectedId) ?? revisions.at(-1)!
  const { proposal, request, usage } = revision
  const section = (id: SectionId, title: string, children: ReactNode, description?: string, collapsible = true, actions?: ReactNode) => <AccordionSection key={`${revision.generatedAt}-${id}`} variant="panel" title={title} description={description} actions={actions} collapsible={collapsible} expanded={expanded.has(id)} onExpandedChange={open => setExpanded(current => {
    const next = new Set(current)
    if (open) next.add(id)
    else next.delete(id)
    return next
  })}>{children}</AccordionSection>

  return <div className="ai-response-accordion" aria-label="AI response">
    {section("summary", "AI Generated Summary", <div className="ai-response-summary-panel">
      <section><strong>Model</strong><p>{revision.model}</p></section>
      <section><strong>Confidence</strong><p>{Math.round(proposal.confidence * 1000) / 10}%</p></section>
      <section><strong>Total tokens</strong><p>{usage.totalTokens.toLocaleString()}</p></section>
      <section className="wide"><strong>Explanation</strong><p>{proposal.explanation}</p></section>
      {proposal.warnings.length > 0 && <section className="wide warning"><strong>Warnings</strong><ul>{proposal.warnings.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}
      {proposal.assumptions.length > 0 && <section className="wide"><strong>Assumptions</strong><ul>{proposal.assumptions.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}
    </div>, `${revision.kind === "generate" ? "Generated" : `Fixed · revision ${revision.number}`} ${new Date(revision.generatedAt).toLocaleString()}`, false, <Select className="ai-response-history" title="AI revision history" ariaLabel="Select AI revision" trigger={<History aria-hidden="true" />} menuWidth={250} value={revision.generatedAt} onValueChange={setSelectedId} options={revisions.map(item => ({ value: item.generatedAt, label: `${item.kind === "generate" ? "Generated" : `Fix ${item.number}`} · ${new Date(item.generatedAt).toLocaleString()}` }))} />)}
    {proposal.parameterizedValues.length > 0 && section("parameters", "Parameterized values", <div className="ai-parameter-list">{proposal.parameterizedValues.map((value, index) => <div key={`${value.parameter}-${index}`}><code>{value.original}</code><span>→</span><code>{value.parameter}</code><p>{value.reason}</p></div>)}</div>, `${proposal.parameterizedValues.length} value${proposal.parameterizedValues.length === 1 ? "" : "s"}`)}
    {section("params-code", "Parameters generator", <GeneratedCode source={proposal.paramsGeneratorTs} field="params" responseId={revision.generatedAt} />)}
    {section("question-code", "Question generator", <GeneratedCode source={proposal.questionGeneratorTs} field="question" responseId={revision.generatedAt} />)}
    {section("explanation-code", "Explanation generator", <GeneratedCode source={proposal.explanationGeneratorTs} field="explanation" responseId={revision.generatedAt} />)}
    {section("origin-code", "Original parameters", <GeneratedCode source={proposal.originParamsTs} field="origin" responseId={revision.generatedAt} />)}
    {request && section("request", "Request", <div className="ai-response-request"><strong>Instructions</strong><p>{String(request.administratorInstructions ?? "")}</p>{request.context != null && <><strong>Quiz context</strong><Code>{JSON.stringify(request.context, null, 2)}</Code></>}{request.question != null && <><strong>Question payload</strong><Code>{JSON.stringify(request.question, null, 2)}</Code></>}{request.currentCode != null && <><strong>Code before fix</strong><Code>{JSON.stringify(request.currentCode, null, 2)}</Code></>}<span>{String(request.task ?? "")} · {String(request.currentDate ?? "")}</span></div>)}
    {section("usage", "Token usage", <Code>{JSON.stringify(usage, null, 2)}</Code>)}
  </div>
}
