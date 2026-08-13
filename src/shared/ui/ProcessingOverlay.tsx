import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Sparkles } from "lucide-react"

function elapsedLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

export function ProcessingOverlay({ open, title, description, showElapsed = false }: { open: boolean; title: string; description?: string; showElapsed?: boolean }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  useEffect(() => {
    if (!open || !showElapsed) { setElapsedSeconds(0); return }
    const startedAt = Date.now()
    setElapsedSeconds(0)
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250)
    return () => window.clearInterval(timer)
  }, [open, showElapsed])
  if (!open) return null
  return createPortal(<div className="processing-overlay" role="status" aria-live="polite" aria-busy="true">
    <div className="processing-overlay-card">
      <span className="processing-overlay-spinner"><Sparkles /></span>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
      {showElapsed && <time className="processing-overlay-time" aria-label={`Processing time ${elapsedLabel(elapsedSeconds)}`}>{elapsedLabel(elapsedSeconds)}</time>}
    </div>
  </div>, document.body)
}
