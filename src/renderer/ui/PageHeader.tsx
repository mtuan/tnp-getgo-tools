import type { ReactNode } from "react"

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  leading?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, leading, actions, className = "" }: PageHeaderProps) {
  return <header className={`ui-page-header ${className}`.trim()}>
    <div className="ui-page-header-main">
      {leading}
      <div className="ui-page-header-copy">
        {eyebrow && <span className="ui-page-header-eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </div>
    {actions && <div className="ui-page-header-actions">{actions}</div>}
  </header>
}
