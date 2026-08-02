import type { ReactNode } from "react"

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  leading?: ReactNode
  actions?: ReactNode
  variant?: "page" | "editor"
  className?: string
}

export function PageHeader({ eyebrow, title, description, leading, actions, variant = "page", className = "" }: PageHeaderProps) {
  return <header className={`${variant === "editor" ? "editor-heading" : "page-heading"} ${className}`.trim()}><div>{leading}<div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div></div>{actions && <div className={variant === "editor" ? "editor-actions" : "manager-actions"}>{actions}</div>}</header>
}
