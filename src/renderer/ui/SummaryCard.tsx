import type { ReactNode } from "react"

export function SummaryCard({ label, value, detail, className = "" }: { label: ReactNode; value: ReactNode; detail?: ReactNode; className?: string }) {
  return <article className={`ui-summary-card ${className}`.trim()}><span>{label}</span><strong>{value}</strong>{detail !== undefined && <small>{detail}</small>}</article>
}

export function SummaryStrip({ items, className = "" }: { items: Array<{ label: ReactNode; value: ReactNode }>; className?: string }) {
  return <div className={`ui-summary-strip quiz-facts ${className}`.trim()}>{items.map((item, index) => <span key={index}><strong>{item.label}</strong>{item.value}</span>)}</div>
}
