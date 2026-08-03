import { createPortal } from "react-dom"
import { Sparkles } from "lucide-react"

export function ProcessingOverlay({ open, title, description }: { open: boolean; title: string; description?: string }) {
  if (!open) return null
  return createPortal(<div className="processing-overlay" role="status" aria-live="polite" aria-busy="true">
    <div className="processing-overlay-card">
      <span className="processing-overlay-spinner"><Sparkles /></span>
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  </div>, document.body)
}
