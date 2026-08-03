import { useEffect, useMemo, useState } from "react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionFixResult, DynamicQuestionProposal, DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { QuizCodeDiffViewer, QuizCodeEditor } from "./QuizCodeEditor"
import { DialogFrame } from "./ui/DialogFrame"
import { Select } from "./ui/Select"
import { Tabs, type TabItem } from "./ui/Tabs"

type StoredGenerate = DynamicQuestionProposalResult & { generatedAt: string }
type StoredFix = DynamicQuestionFixResult & { generatedAt: string; proposal?: DynamicQuestionProposal }
type Revision = { id: string; generatedAt: string; proposal: DynamicQuestionProposal; model: string; request?: Record<string, unknown>; usage: DynamicQuestionProposalResult["usage"]; kind: "generate" | "fix"; number: number; fix?: StoredFix; previous?: DynamicQuestionProposal }
type TabId = "summary" | "parameters" | "params" | "question" | "explanation" | "origin" | "request" | "usage" | "diff"

const fields = {
  paramsGeneratorTs: { label: "Parameters generator", tab: "params" as const },
  questionGeneratorTs: { label: "Question generator", tab: "question" as const },
  explanationGeneratorTs: { label: "Explanation generator", tab: "explanation" as const },
  originParamsTs: { label: "Original parameters", tab: "origin" as const },
}

function revisionsOf(response: StoredGenerate, history: StoredFix[]): Revision[] {
  let previous = response.proposal
  const revisions: Revision[] = [{ id: response.generatedAt, generatedAt: response.generatedAt, proposal: response.proposal, model: response.model, request: response.request, usage: response.usage, kind: "generate", number: 0 }]
  history.forEach((item, index) => {
    const before = previous
    const legacyChanges = Object.fromEntries((item.changes ?? []).map(change => [change.field, change.source]))
    previous = item.proposal ?? { ...previous, ...legacyChanges, explanation: item.explanation || previous.explanation, warnings: item.warnings ?? previous.warnings }
    revisions.push({ id: item.generatedAt, generatedAt: item.generatedAt, proposal: previous, previous: before, model: item.model, request: item.request, usage: item.usage, kind: "fix", number: index + 1, fix: item })
  })
  return revisions
}

function Json({ value }: { value: unknown }) { return <pre className="ai-history-json">{JSON.stringify(value, null, 2)}</pre> }

function Code({ source, field, revision }: { source: string; field: keyof typeof fields; revision: string }) {
  const [formatted, setFormatted] = useState(source)
  useEffect(() => {
    let active = true
    const expression = field === "originParamsTs" ? `(${source})` : source
    void QuizTsService.formatSnippet(expression).then(value => {
      if (!active) return
      const clean = value.trim().replace(/^;\s*/, "")
      setFormatted(field === "originParamsTs" ? clean.replace(/^\(\s*/, "").replace(/\s*\)$/, "") : clean)
    }).catch(() => { if (active) setFormatted(source) })
    return () => { active = false }
  }, [field, source])
  return <div className="ai-history-code"><QuizCodeEditor value={formatted} path={`ai-history/${revision}-${field}.ts`} readOnly autoHeight minHeight={140} onChange={() => undefined} onSave={() => undefined} /></div>
}

export function AiHistoryDrawer({ record, onClose }: { record: QuizQuestionRecord; onClose(): void }) {
  const response = record.aiResponse!
  const revisions = useMemo(() => revisionsOf(response, (record.aiFixHistory ?? []) as StoredFix[]), [record.aiFixHistory, response])
  const [revisionId, setRevisionId] = useState(() => revisions.at(-1)!.id)
  const [tab, setTab] = useState<TabId>("summary")
  const revision = revisions.find(item => item.id === revisionId) ?? revisions.at(-1)!
  const tabs: TabItem<TabId>[] = [
    { id: "summary", label: "Summary" },
    ...(revision.proposal.parameterizedValues.length ? [{ id: "parameters" as const, label: "Parameters", badge: revision.proposal.parameterizedValues.length }] : []),
    { id: "params", label: "Parameters code" }, { id: "question", label: "Question code" }, { id: "explanation", label: "Explanation code" }, { id: "origin", label: "Original values" },
    { id: "request", label: "Request" }, { id: "usage", label: "Usage" },
    ...(revision.kind === "fix" ? [{ id: "diff" as const, label: "Code diff", badge: revision.fix?.changes.length ?? 0 }] : []),
  ]
  useEffect(() => { if (!tabs.some(item => item.id === tab)) setTab("summary") }, [revisionId])
  const selectedField = tab === "params" ? "paramsGeneratorTs" : tab === "question" ? "questionGeneratorTs" : tab === "explanation" ? "explanationGeneratorTs" : tab === "origin" ? "originParamsTs" : null
  return <DialogFrame presentation="drawer" className="ai-history-drawer" hideFooter title="AI generation history" busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}>
    <div className="ai-history-toolbar"><Select value={revision.id} onValueChange={value => { setRevisionId(value); setTab("summary") }} options={revisions.map(item => ({ value: item.id, label: `${item.kind === "generate" ? "Generated" : `Fix ${item.number}`} · ${new Date(item.generatedAt).toLocaleString()}` }))} /></div>
    <Tabs<TabId> variant="underline" className="ai-history-tabs" ariaLabel="AI revision data" value={tab} onChange={setTab} items={tabs} />
    <div className="ai-history-content">
      {tab === "summary" && <div className="ai-response-summary-panel"><section><strong>Model</strong><p>{revision.model}</p></section><section><strong>Confidence</strong><p>{Math.round(revision.proposal.confidence * 1000) / 10}%</p></section><section><strong>Total tokens</strong><p>{revision.usage.totalTokens.toLocaleString()}</p></section><section className="wide"><strong>Explanation</strong><p>{revision.proposal.explanation}</p></section>{revision.proposal.warnings.length > 0 && <section className="wide warning"><strong>Warnings</strong><ul>{revision.proposal.warnings.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}{revision.proposal.assumptions.length > 0 && <section className="wide"><strong>Assumptions</strong><ul>{revision.proposal.assumptions.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}</div>}
      {tab === "parameters" && <div className="ai-parameter-list">{revision.proposal.parameterizedValues.map((value, index) => <div key={`${value.parameter}-${index}`}><code>{value.original}</code><span>→</span><code>{value.parameter}</code><p>{value.reason}</p></div>)}</div>}
      {selectedField && <Code source={revision.proposal[selectedField]} field={selectedField} revision={revision.id} />}
      {tab === "request" && <Json value={revision.request ?? {}} />}
      {tab === "usage" && <Json value={revision.usage} />}
      {tab === "diff" && <div className="ai-history-diffs">{revision.fix?.changes.map(change => <section key={change.field}><header><strong>{fields[change.field].label}</strong><span>{change.reason}</span></header><QuizCodeDiffViewer path={`ai-history/${revision.id}-${change.field}`} original={revision.previous?.[change.field] ?? ""} modified={revision.proposal[change.field]} /></section>)}</div>}
    </div>
  </DialogFrame>
}
