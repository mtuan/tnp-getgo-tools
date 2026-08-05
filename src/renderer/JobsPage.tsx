import { useCallback, useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, XCircle } from "lucide-react"
import type { AiMigrationJob, AiMigrationJobsSnapshot } from "../core/models"
import { Button, ErrorFrame, PageHeader, Panel, SegmentedControl } from "./ui"

const activeStatuses = new Set(["queued", "running"])

function durationLabel(job: AiMigrationJob, now: number) {
  const start = Date.parse(job.startedAt ?? job.createdAt)
  const end = job.finishedAt ? Date.parse(job.finishedAt) : now
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—"
  const seconds = Math.max(0, Math.floor((end - start) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`
}

function statusIcon(status: AiMigrationJob["status"]) {
  if (status === "completed") return <CheckCircle2 />
  if (status === "failed" || status === "cancelled") return <XCircle />
  return <Clock3 />
}

export function JobsPage({ onOpenQuiz }: { onOpenQuiz(route: string): void }) {
  const [snapshot, setSnapshot] = useState<AiMigrationJobsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyJob, setBusyJob] = useState<string | null>(null)
  const [savingConcurrency, setSavingConcurrency] = useState(false)
  const [now, setNow] = useState(Date.now())

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
    if (!snapshot?.jobs.some(job => job.status === "running")) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [snapshot?.jobs])

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

  return <section className="jobs-page">
    <PageHeader eyebrow="Background work" title="Jobs" description="Recent quiz migrations and their results." actions={snapshot && <div className="jobs-concurrency"><span>Concurrent jobs</span><SegmentedControl value={String(snapshot.concurrency)} options={[1, 2, 3, 4].map(value => ({ value: String(value), label: String(value) }))} disabled={savingConcurrency} ariaLabel="Concurrent migration jobs" onValueChange={value => void setConcurrency(value)} /></div>} />
    {error && <div className="jobs-load-error"><ErrorFrame message={error} /><Button onClick={() => void load()}>Retry</Button></div>}
    {!error && snapshot && <Panel className="jobs-list" title="Recent jobs" description="Jobs continue running when you navigate elsewhere in GetGo Tools." meta={`${snapshot.jobs.length} job${snapshot.jobs.length === 1 ? "" : "s"}`}>
      {snapshot.jobs.length === 0 ? <div className="jobs-empty">No migration jobs yet. Open a quiz and choose <strong>AI migrate</strong>.</div> : snapshot.jobs.map(job => {
        const percent = job.total ? Math.min(100, Math.round(job.processed / job.total * 100)) : 100
        const finished = !activeStatuses.has(job.status)
        return <article className="job-row" key={job.id}>
          <div className={`job-status-icon job-status-${job.status}`}>{statusIcon(job.status)}</div>
          <div className="job-main">
            <div className="job-title-line"><div><strong>{job.quizTitle}</strong><span>{job.quizId}</span></div><span className={`job-status job-status-${job.status}`}>{job.status}</span></div>
            <div className="job-progress"><progress max={Math.max(job.total, 1)} value={job.total ? job.processed : 1} /><span>{percent}%</span></div>
            <div className="job-detail"><span>{job.status === "queued" ? "Waiting to start" : job.currentQuestion ? `Question ${job.currentQuestion}` : `${job.processed} of ${job.total} processed`}</span><span>{durationLabel(job, now)}</span></div>
            <p className="job-result">{job.succeeded} saved · {job.failed} failed · {job.skippedImages} images skipped · {job.skippedVerified} verified skipped</p>
            {job.errors.length > 0 && <p className="job-error"><AlertCircle />Question {job.errors.at(-1)?.questionNo}: {job.errors.at(-1)?.message}</p>}
          </div>
          <div className="job-actions">
            {!finished && <Button color="danger" loading={busyJob === job.id} onClick={() => void cancel(job)}>Cancel</Button>}
            {finished && <Button icon={<ExternalLink />} onClick={() => onOpenQuiz(`/quizzes/contests/${encodeURIComponent(job.contestId)}/quizzes/${encodeURIComponent(job.quizId)}`)}>Review quiz</Button>}
          </div>
        </article>
      })}
    </Panel>}
  </section>
}
