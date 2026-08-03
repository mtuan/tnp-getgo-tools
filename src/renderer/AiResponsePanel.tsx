import type { DynamicQuestionProposalResult } from "../core/models"
import { Panel } from "./ui/Panel"
import { SummaryCard } from "./ui/SummaryCard"

type StoredAiResponse = DynamicQuestionProposalResult & { generatedAt: string }

function CodeSection({ title, source }: { title: string; source: string }) {
  return <details className="ai-response-section"><summary>{title}</summary><pre>{source}</pre></details>
}

export function AiResponsePanel({ response }: { response: StoredAiResponse }) {
  const { proposal, request, usage } = response
  return <Panel className="ai-response-panel" title="AI response" description={`Generated ${new Date(response.generatedAt).toLocaleString()}`}>
    <div className="ai-response-content">
      <div className="ai-response-summary">
        <SummaryCard label="Model" value={response.model} />
        <SummaryCard label="Confidence" value={`${Math.round(proposal.confidence * 1000) / 10}%`} />
        <SummaryCard label="Total tokens" value={usage.totalTokens.toLocaleString()} />
      </div>
      <section className="ai-response-copy"><strong>Explanation</strong><p>{proposal.explanation}</p></section>
      {proposal.warnings.length > 0 && <section className="ai-response-list warning"><strong>Warnings</strong><ul>{proposal.warnings.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}
      {proposal.assumptions.length > 0 && <section className="ai-response-list"><strong>Assumptions</strong><ul>{proposal.assumptions.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}
      {proposal.parameterizedValues.length > 0 && <details className="ai-response-section"><summary>Parameterized values</summary><div className="ai-parameter-list">{proposal.parameterizedValues.map((value, index) => <div key={`${value.parameter}-${index}`}><code>{value.original}</code><span>→</span><code>{value.parameter}</code><p>{value.reason}</p></div>)}</div></details>}
      <CodeSection title="Parameters generator" source={proposal.paramsGeneratorTs} />
      <CodeSection title="Question generator" source={proposal.questionGeneratorTs} />
      <CodeSection title="Explanation generator" source={proposal.explanationGeneratorTs} />
      <CodeSection title="Original parameters" source={proposal.originParamsTs} />
      {request && <details className="ai-response-section"><summary>Request</summary><div className="ai-response-request"><strong>Instructions</strong><p>{request.administratorInstructions}</p><strong>Question payload</strong><pre>{JSON.stringify(request.question, null, 2)}</pre><span>{request.task} · {request.currentDate}</span></div></details>}
      <details className="ai-response-section"><summary>Token usage</summary><pre>{JSON.stringify(usage, null, 2)}</pre></details>
    </div>
  </Panel>
}
