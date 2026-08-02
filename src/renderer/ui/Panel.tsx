import type { HTMLAttributes, ReactNode } from "react"

export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode
  description?: ReactNode
  meta?: ReactNode
}

export function Panel({ title, description, meta, children, className = "", ...props }: PanelProps) {
  return <section className={`panel ${className}`.trim()} {...props}>{(title || description || meta) && <header className="panel-heading"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{meta && <span>{meta}</span>}</header>}{children}</section>
}
