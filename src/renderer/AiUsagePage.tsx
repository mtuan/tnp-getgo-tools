import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import type { AiUsageInfo } from "../core/models"
import { Button } from "./ui/Button"
import { PageHeader } from "./ui/PageHeader"
import { Panel } from "./ui/Panel"
import { SummaryCard } from "./ui/SummaryCard"
import { useToast } from "./ui/Toast"

const integer = new Intl.NumberFormat()
const duration = (milliseconds: number) => milliseconds ? `${(milliseconds / 1000).toFixed(1)}s` : "—"

export function AiUsagePage() {
  const toast = useToast()
  const [usage, setUsage] = useState<AiUsageInfo | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(announce = false) {
    setLoading(true)
    try {
      const next = await window.getgo.getAiUsage()
      setUsage(next)
      if (announce) toast.show({ title: "AI usage refreshed", description: `${next.totals.requests} saved requests found.` })
    } catch (cause) {
      toast.show({ title: "Could not load AI usage", description: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])
  const totals = usage?.totals
  return <section className="ai-usage-page">
    <PageHeader eyebrow="OpenAI" title="AI usage" description="Usage recorded with local question generation and fix history." actions={<Button icon={<RefreshCw size={15} />} loading={loading} onClick={() => void load(true)}>Refresh</Button>} />
    <section className="metrics ai-usage-metrics">
      <SummaryCard label="Saved requests" value={totals?.requests ?? 0} detail="generate and fix operations" />
      <SummaryCard label="Total tokens" value={integer.format(totals?.totalTokens ?? 0)} detail={`${integer.format(totals?.inputTokens ?? 0)} input · ${integer.format(totals?.outputTokens ?? 0)} output`} />
      <SummaryCard label="Cached input" value={integer.format(totals?.cachedInputTokens ?? 0)} detail="tokens served from cache" />
      <SummaryCard label="Processing time" value={duration(totals?.processingTimeMs ?? 0)} detail="across saved operations" />
    </section>
    <Panel title="Remaining API credits" description="OpenAI does not expose the prepaid-credit balance through a supported API.">
      <div className="ai-credit-notice"><strong>Balance unavailable</strong><span>View the authoritative balance and add credits in OpenAI organization billing.</span><Button variant="solid" onClick={() => void window.getgo.openExternal("https://platform.openai.com/settings/organization/billing/credit-grants")}>Open billing</Button></div>
    </Panel>
    <Panel title="Request history" description={usage ? `Scanned ${new Date(usage.scannedAt).toLocaleString()}` : "Reading local AI history…"}>
      <div className="ai-usage-table-wrap"><table className="ai-usage-table"><thead><tr><th>Operation</th><th>Question</th><th>Model</th><th>Input</th><th>Output</th><th>Total</th><th>Time</th><th>Generated</th></tr></thead><tbody>
        {usage?.records.map(record => <tr key={record.id}><td><span className={`badge badge-${record.kind === "generate" ? "generated" : "normalized"}`}>{record.kind}</span></td><td><strong>{record.quizTitle}</strong><span>{record.contestId} · Question {record.questionNo}</span></td><td>{record.model}</td><td>{integer.format(record.inputTokens)}</td><td>{integer.format(record.outputTokens)}</td><td>{integer.format(record.totalTokens)}</td><td>{duration(record.processingTimeMs)}</td><td>{record.generatedAt ? new Date(record.generatedAt).toLocaleString() : "—"}</td></tr>)}
        {!loading && !usage?.records.length && <tr><td colSpan={8} className="ai-usage-empty">No saved AI usage was found in the current repository.</td></tr>}
      </tbody></table></div>
    </Panel>
  </section>
}
