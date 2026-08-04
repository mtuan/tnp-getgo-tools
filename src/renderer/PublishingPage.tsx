import { AlertTriangle, CloudUpload, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import type { AppSettings, PublishingQuizStatus, PublishingSnapshot, PublishingStatus } from "../core/models"
import en from "./locales/en.json"
import vi from "./locales/vi.json"
import { useAuth } from "./AuthContext"
import { Button } from "./ui/Button"
import { DataTable, type DataColumn } from "./ui/DataTable"
import { DialogFrame } from "./ui/DialogFrame"
import { ErrorFrame } from "./ui/ErrorFrame"
import { PageHeader } from "./ui/PageHeader"
import { Select } from "./ui/Select"
import { SummaryCard } from "./ui/SummaryCard"
import { useToast } from "./ui/Toast"

const copy = (navigator.language.toLowerCase().startsWith("vi") ? vi : en).publishing
const labels: Record<PublishingStatus, string> = {
  "not-published": copy.notPublished,
  "up-to-date": copy.upToDate,
  changed: copy.changed,
  "local-error": copy.localError,
  "remote-error": copy.remoteError,
}
const interpolate = (value: string, data: Record<string, string | number>) => Object.entries(data).reduce((result, [key, replacement]) => result.replace(`{${key}}`, String(replacement)), value)
export function PublishingPage({ environment }: { environment: AppSettings["environment"] }) {
  const auth = useAuth()
  const toast = useToast()
  const [snapshot, setSnapshot] = useState<PublishingSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [contest, setContest] = useState("all")
  const [status, setStatus] = useState("all")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const next = await window.getgo.getPublishingStatus()
      setSnapshot(next)
      setSelected(current => new Set([...current].filter(key => next.quizzes.some(row => `${row.contestId}/${row.quizId}` === key && ["changed", "not-published"].includes(row.status)))))
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { setSnapshot(null); setSelected(new Set()); if (auth.state.user) void load() }, [auth.state.user, environment, load])
  const rows = snapshot?.quizzes ?? []
  const contests = useMemo(() => [...new Set(rows.map(row => row.contestId))].sort(), [rows])
  const visible = rows.filter(row => (contest === "all" || row.contestId === contest) && (status === "all" || row.status === status) && `${row.title} ${row.quizId}`.toLowerCase().includes(query.trim().toLowerCase()))
  const publishable = visible.filter(row => ["changed", "not-published"].includes(row.status))
  const selectedRows = rows.filter(row => selected.has(`${row.contestId}/${row.quizId}`))
  const selectedQuestions = selectedRows.reduce((total, row) => total + (row.questionCount ?? 0), 0)
  const toggle = (row: PublishingQuizStatus, checked: boolean) => setSelected(current => { const next = new Set(current); const key = `${row.contestId}/${row.quizId}`; if (checked) next.add(key); else next.delete(key); return next })

  async function publish(event: FormEvent) {
    event.preventDefault(); setPublishing(true); setError(null)
    let completed = 0
    try {
      for (const row of selectedRows) { await window.getgo.publishQuiz(row.contestId, row.quizId); completed++ }
      setConfirming(false); setSelected(new Set()); await load()
      toast.show({ title: copy.successTitle, description: interpolate(copy.successDescription, { count: completed }) })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(message); setConfirming(false)
      toast.show({ title: copy.failureTitle, description: message, variant: "error" })
      await load().catch(() => undefined)
    } finally { setPublishing(false) }
  }

  const columns: DataColumn<PublishingQuizStatus>[] = [
    { key: "select", title: <input type="checkbox" aria-label={copy.selectAll} checked={publishable.length > 0 && publishable.every(row => selected.has(`${row.contestId}/${row.quizId}`))} onChange={event => setSelected(current => { const next = new Set(current); for (const row of publishable) { const key = `${row.contestId}/${row.quizId}`; if (event.target.checked) next.add(key); else next.delete(key) } return next })} />, width: 42, render: row => <input type="checkbox" aria-label={`${copy.selection}: ${row.title}`} checked={selected.has(`${row.contestId}/${row.quizId}`)} disabled={!(["changed", "not-published"] as PublishingStatus[]).includes(row.status)} onChange={event => toggle(row, event.target.checked)} /> },
    { key: "quiz", title: copy.quiz, render: row => <><strong>{row.title}</strong><span>{row.quizId}</span></> },
    { key: "contest", title: copy.contest, render: row => row.contestId.toUpperCase() },
    { key: "questions", title: copy.questions, render: row => row.questionCount ?? "—" },
    { key: "status", title: copy.status, render: row => <><span className={`badge publishing-status publishing-status-${row.status}`} title={row.error}>{labels[row.status]}</span>{row.error && <span className="publishing-row-error">{row.error}</span>}</> },
    { key: "published", title: copy.published, render: row => row.publishedAt ? new Date(row.publishedAt).toLocaleString() : copy.never },
  ]

  if (!auth.loading && !auth.state.user) return <section className="publishing-auth"><CloudUpload /><h1>{copy.title}</h1><p>{copy.authentication}</p><Button variant="primary" onClick={() => auth.requestLogin()}>{copy.signIn}</Button></section>
  return <section className="publishing-page">
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={snapshot ? `${copy.description} ${snapshot.environment} · ${snapshot.projectId}` : copy.description} actions={<><Button icon={<RefreshCw />} loading={loading} onClick={() => auth.requireAuth(load)}>{copy.refresh}</Button><Button icon={<CloudUpload />} variant="primary" disabled={!selected.size || loading} onClick={() => setConfirming(true)}>{copy.publishSelected}{selected.size ? ` (${selected.size})` : ""}</Button></>} />
    {error && <ErrorFrame message={error} />}
    {loading && !snapshot ? <div className="publishing-skeleton" aria-label={copy.loading}><div /><div /><div /><div /></div> : <>
      <section className="metrics publishing-metrics"><SummaryCard label={copy.summaryTotal} value={rows.length} /><SummaryCard label={copy.summaryChanged} value={rows.filter(row => ["changed", "not-published"].includes(row.status)).length} /><SummaryCard label={copy.summaryCurrent} value={rows.filter(row => row.status === "up-to-date").length} /><SummaryCard label={copy.summaryErrors} value={rows.filter(row => row.status.endsWith("error")).length} /></section>
      <div className="filters publishing-filters"><input value={query} aria-label={copy.search} placeholder={copy.search} onChange={event => setQuery(event.target.value)} /><Select value={contest} ariaLabel={copy.contest} options={[{ value: "all", label: copy.allContests }, ...contests.map(value => ({ value, label: value.toUpperCase() }))]} onValueChange={setContest} /><Select value={status} ariaLabel={copy.status} options={[{ value: "all", label: copy.allStatuses }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} onValueChange={setStatus} /></div>
      <div className="table-panel publishing-table"><DataTable rows={visible} columns={columns} rowKey={row => `${row.contestId}/${row.quizId}`} ariaLabel={copy.title} emptyText={copy.empty} /></div>
    </>}
    {confirming && <DialogFrame presentation="modal" className="publishing-confirm" title={copy.confirmTitle} busy={publishing} error={null} onClose={() => setConfirming(false)} onSubmit={publish} submitLabel={copy.confirm}><div className="publishing-confirm-copy"><CloudUpload /><p>{interpolate(copy.confirmText, { quizzes: selectedRows.length, questions: selectedQuestions, project: snapshot?.projectId ?? environment })}</p></div>{environment === "production" && <div className="publishing-production-warning"><AlertTriangle /><strong>{copy.productionWarning}</strong></div>}</DialogFrame>}
  </section>
}
