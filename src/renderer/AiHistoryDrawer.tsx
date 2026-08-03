import { useEffect, useMemo, useState } from "react"
import { QuizTsService } from "@tnp/getgo-logics/authoring"
import type { DynamicQuestionFixResult, DynamicQuestionProposal, DynamicQuestionProposalResult, QuizQuestionRecord } from "../core/models"
import { QuizCodeDiffViewer, QuizCodeEditor } from "./QuizCodeEditor"
import { DialogFrame } from "./ui/DialogFrame"
import { Select } from "./ui/Select"
import { Tabs, type TabItem } from "./ui/Tabs"
import { Toggle } from "./ui/Toggle"

type StoredGenerate = DynamicQuestionProposalResult & { generatedAt: string }
type StoredFix = DynamicQuestionFixResult & { generatedAt: string; proposal?: DynamicQuestionProposal }
type Revision = { id: string; generatedAt: string; proposal: DynamicQuestionProposal; model: string; request?: Record<string, unknown>; usage: DynamicQuestionProposalResult["usage"]; kind: "generate" | "fix"; number: number; fix?: StoredFix; previous?: DynamicQuestionProposal }
type TabId = "summary" | "parameters" | "params" | "question" | "explanation" | "origin" | "request"

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

function Json({ value, path }: { value: unknown; path: string }) { return <div className="ai-history-code"><QuizCodeEditor value={JSON.stringify(value, null, 2)} path={path} language="json" readOnly autoHeight minHeight={140} onChange={() => undefined} onSave={() => undefined} /></div> }

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
  const [codeView, setCodeView] = useState<"final" | "diff">("final")
  const revision = revisions.find(item => item.id === revisionId) ?? revisions.at(-1)!
  const tabs: TabItem<TabId>[] = [
    { id: "summary", label: "Summary" },
    ...(revision.proposal.parameterizedValues.length ? [{ id: "parameters" as const, label: "Parameters", badge: revision.proposal.parameterizedValues.length }] : []),
    { id: "params", label: "Parameters code" }, { id: "question", label: "Question code" }, { id: "explanation", label: "Explanation code" }, { id: "origin", label: "Original values" },
    { id: "request", label: "Request" },
  ]
  useEffect(() => { if (!tabs.some(item => item.id === tab)) setTab("summary") }, [revisionId])
  useEffect(() => { setCodeView("final") }, [revisionId, tab])
  const selectedField = tab === "params" ? "paramsGeneratorTs" : tab === "question" ? "questionGeneratorTs" : tab === "explanation" ? "explanationGeneratorTs" : tab === "origin" ? "originParamsTs" : null
  const selectedChange = selectedField ? revision.fix?.changes.find(change => change.field === selectedField) : undefined
  return <DialogFrame presentation="drawer" className="ai-history-drawer" hideFooter title="AI generation history" busy={false} error={null} onClose={onClose} onSubmit={event => event.preventDefault()}>
    <div className="ai-history-toolbar"><Select value={revision.id} onValueChange={value => { setRevisionId(value); setTab("summary") }} options={revisions.map(item => ({ value: item.id, label: `${item.kind === "generate" ? "Generated" : `Fix ${item.number}`} · ${new Date(item.generatedAt).toLocaleString()}` }))} /></div>
    <Tabs<TabId> variant="underline" className="ai-history-tabs" ariaLabel="AI revision data" value={tab} onChange={setTab} items={tabs} />
    <div className="ai-history-content">
      {tab === "summary" && <div className="ai-response-summary-panel"><section><strong>Model</strong><p>{revision.model}</p></section><section><strong>Confidence</strong><p>{Math.round(revision.proposal.confidence * 1000) / 10}%</p></section><section><strong>Total tokens</strong><p>{revision.usage.totalTokens.toLocaleString()}</p></section><section><strong>Input tokens</strong><p>{revision.usage.inputTokens.toLocaleString()}</p></section><section><strong>Output tokens</strong><p>{revision.usage.outputTokens.toLocaleString()}</p></section><section><strong>Cached input</strong><p>{revision.usage.cachedInputTokens.toLocaleString()}</p></section><section><strong>Cache write</strong><p>{revision.usage.cacheWriteTokens.toLocaleString()}</p></section><section className="wide"><strong>Explanation</strong><p>{revision.proposal.explanation}</p></section>{revision.proposal.warnings.length > 0 && <section className="wide warning"><strong>Warnings</strong><ul>{revision.proposal.warnings.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}{revision.proposal.assumptions.length > 0 && <section className="wide"><strong>Assumptions</strong><ul>{revision.proposal.assumptions.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul></section>}</div>}
      {tab === "parameters" && <div className="ai-parameter-list">{revision.proposal.parameterizedValues.map((value, index) => <div key={`${value.parameter}-${index}`}><code>{value.original}</code><span>→</span><code>{value.parameter}</code><p>{value.reason}</p></div>)}</div>}
      {selectedField && <>{selectedChange && <div className="ai-history-code-toolbar"><span>{selectedChange.reason}</span><div className="ai-history-code-toggle"><span>{codeView === "diff" ? "Diff" : "Final"}</span><Toggle ariaLabel="Show code diff" checked={codeView === "diff"} onCheckedChange={checked => setCodeView(checked ? "diff" : "final")} /></div></div>}{codeView === "diff" && selectedChange ? <div className="ai-history-code-diff"><QuizCodeDiffViewer path={`ai-history/${revision.id}-${selectedField}`} original={revision.previous?.[selectedField] ?? ""} modified={revision.proposal[selectedField]} /></div> : <Code source={revision.proposal[selectedField]} field={selectedField} revision={revision.id} />}</>}
      {tab === "request" && <Json path={`ai-history/${revision.id}-request.json`} value={revision.request ?? {}} />}
    </div>
  </DialogFrame>
}
