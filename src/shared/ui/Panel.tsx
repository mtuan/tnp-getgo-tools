import type { HTMLAttributes, ReactNode } from "react"

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode
  description?: ReactNode
  meta?: ReactNode
}

export type PanelBodyProps = HTMLAttributes<HTMLDivElement>

/** Standard padded content region for Panel children. */
export function PanelBody({ className = "", ...props }: PanelBodyProps) {
  return <div className={`ui-panel-body ${className}`.trim()} {...props} />
}

export function Panel({ title, description, meta, children, className = "", ...props }: PanelProps) {
  return <section className={`panel ${className}`.trim()} {...props}>{(title || description || meta) && <header className="panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{meta && <div className="panel-heading-meta">{meta}</div>}</header>}{children}</section>
}
