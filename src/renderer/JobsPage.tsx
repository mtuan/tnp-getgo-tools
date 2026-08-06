import { useCallback, useEffect, useState } from "react"
import { AlertCircle, ExternalLink } from "lucide-react"
import type { AiMigrationJob, AiMigrationJobsSnapshot } from "../core/models"
import { Button, DataTable, ErrorFrame, PageHeader, Panel, SegmentedControl, type DataColumn } from "./ui"

const activeStatuses = new Set(["queued", "running"])

function durationLabel(job: AiMigrationJob, now: number) {
  if (!job.startedAt) return "0:00"
  const start = Date.parse(job.startedAt)
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—"
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`
}

export function JobsPage({ onOpenQuiz }: { onOpenQuiz(route: string): void }) {
  const [snapshot, setSnapshot] = useState<AiMigrationJobsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyJob, setBusyJob] = useState<string | null>(null)
  const [savingConcurrency, setSavingConcurrency] = useState(false)
  const [now, setNow] = useState(Date.now())
  const hasActiveJobs = snapshot?.jobs.some(job => activeStatuses.has(job.status)) ?? false

  const load = useCallback(async () => {
    try {
      setSnapshot(await window.getgo.getAiMigrationJobs())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const timer = window.setInterval(() => void load(), snapshot?.jobs.some(job => activeStatuses.has(job.status)) ? 750 : 2500)
    return () => window.clearInterval(timer)
  }, [load, snapshot?.jobs])
  useEffect(() => {
    if (!hasActiveJobs) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasActiveJobs])

  const setConcurrency = async (value: string) => {
    setSavingConcurrency(true)
    try { setSnapshot(await window.getgo.setAiMigrationConcurrency(Number(value))); setError(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setSavingConcurrency(false) }
  }

  const cancel = async (job: AiMigrationJob) => {
    if (!window.confirm(`Cancel the migration for ${job.quizTitle}? The current AI request will be stopped.`)) return
    setBusyJob(job.id)
    try { setSnapshot(await window.getgo.cancelAiMigrationJob(job.id)); setError(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusyJob(null) }
  }

  const columns: DataColumn<AiMigrationJob>[] = [
    { key: "quiz", title: "Quiz", render: job => <div className="job-table-quiz"><strong>{job.quizTitle}</strong><span>{job.quizId}</span>{job.errors.length > 0 && <small title={job.errors.at(-1)?.message}><AlertCircle />Question {job.errors.at(-1)?.questionNo}: {job.errors.at(-1)?.message}</small>}</div> },
    { key: "status", title: "Status", width: 130, render: job => <div className="job-table-status"><span className={`badge job-status job-status-${job.status}`}>{job.status}</span><small>{job.status === "queued" ? "Waiting" : job.currentQuestion ? `Question ${job.currentQuestion}` : `${job.processed}/${job.total} processed`}</small></div> },
    { key: "total", title: "To migrate", width: 95, align: "center", render: job => <strong>{job.total}</strong> },
    { key: "skipped", title: "Skipped", width: 90, align: "center", render: job => <span title={`${job.skippedImages} image · ${job.skippedVerified} verified`}>{job.skippedImages + job.skippedVerified}</span> },
    { key: "migrated", title: "Migrated", width: 90, align: "center", render: job => <strong>{job.succeeded}</strong> },
    { key: "failed", title: "Failed", width: 75, align: "center", render: job => job.failed },
    { key: "progress", title: "Progress", width: 85, align: "center", render: job => <strong>{job.total ? Math.min(100, Math.round(job.processed / job.total * 100)) : 100}%</strong> },
    { key: "time", title: "Time", width: 85, align: "right", render: job => <span className="job-table-time">{durationLabel(job, now)}</span> },
    { key: "actions", title: "", width: 120, align: "right", render: job => activeStatuses.has(job.status) ? <Button color="danger" loading={busyJob === job.id} onClick={event => { event.stopPropagation(); void cancel(job) }}>Cancel</Button> : <Button icon={<ExternalLink />} onClick={() => onOpenQuiz(`/quizzes/contests/${encodeURIComponent(job.contestId)}/quizzes/${encodeURIComponent(job.quizId)}`)}>Review</Button> },
  ]

  return <section className="jobs-page">
    <PageHeader eyebrow="Background work" title="Jobs" description="Recent quiz migrations and their results." actions={<><Button icon={<ExternalLink />} onClick={() => void window.getgo.openExternal("https://platform.openai.com/usage")}>OpenAI usage</Button>{snapshot && <div className="jobs-concurrency"><span>Concurrent jobs</span><SegmentedControl value={String(snapshot.concurrency)} options={[1, 2, 3, 4].map(value => ({ value: String(value), label: String(value) }))} disabled={savingConcurrency} ariaLabel="Concurrent migration jobs" onValueChange={value => void setConcurrency(value)} /></div>}</>} />
    {error && <div className="jobs-load-error"><ErrorFrame message={error} /><Button onClick={() => void load()}>Retry</Button></div>}
    {!error && snapshot && <Panel className="jobs-list" title="Recent jobs" description="Jobs continue running when you navigate elsewhere in GetGo Tools." meta={`${snapshot.jobs.length} job${snapshot.jobs.length === 1 ? "" : "s"}`}>
      <DataTable ariaLabel="Recent migration jobs" rows={snapshot.jobs} columns={columns} rowKey={job => job.id} emptyText="No migration jobs yet. Open a quiz and choose AI migrate." />
    </Panel>}
  </section>
}
