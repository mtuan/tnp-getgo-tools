import { useEffect, useState } from "react"
import { Sparkles, X } from "lucide-react"
import { Button } from "./ui/Button"

export interface AiMigrationJobState {
  status: "running" | "cancelling" | "completed" | "cancelled"
  quizId: string
  total: number
  processed: number
  succeeded: number
  failed: number
  skippedImages: number
  skippedVerified: number
  currentQuestion?: string
  startedAt: number
  finishedAt?: number
}

const elapsedLabel = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const remainder = seconds % 60
  return hours ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
}

export function AiMigrationProgress({ job, onCancel, onDismiss }: { job: AiMigrationJobState; onCancel(): void; onDismiss(): void }) {
  const active = job.status === "running" || job.status === "cancelling"
  const [now, setNow] = useState(Date.now())
  const [fallbackStartedAt] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  const startedAt = typeof job.startedAt === "number" && Number.isFinite(job.startedAt) ? job.startedAt : fallbackStartedAt
  const percent = job.total ? Math.round(job.processed / job.total * 100) : 100
  return <aside className="ai-migration-progress" aria-live="polite">
    <div className="ai-migration-progress-heading"><i><Sparkles /></i><div><strong>{active ? "AI migration running" : job.status === "completed" ? "AI migration completed" : "AI migration cancelled"}</strong><span>{job.quizId}</span></div>{active ? <Button className="ai-migration-cancel" variant="outline" color="danger" disabled={job.status === "cancelling"} onClick={() => { if (window.confirm("Cancel the AI migration? The current AI request will be stopped.")) onCancel() }}>Cancel</Button> : <Button variant="icon" title="Dismiss" aria-label="Dismiss" icon={<X />} onClick={onDismiss} />}</div>
    <progress max={Math.max(job.total, 1)} value={job.processed} />
    <div className="ai-migration-progress-detail"><span>{job.currentQuestion ? `Question ${job.currentQuestion}` : `${job.processed}/${job.total}`}</span><span>{elapsedLabel((job.finishedAt ?? now) - startedAt)}</span><strong>{percent}%</strong></div>
    <small>{job.succeeded} saved · {job.failed} failed · {job.skippedImages} images skipped · {job.skippedVerified} verified skipped</small>
  </aside>
}
