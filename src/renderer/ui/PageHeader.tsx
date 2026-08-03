import type { ReactNode } from "react"

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  leading?: ReactNode
  titleAction?: ReactNode
  navigation?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, description, leading, titleAction, navigation, actions, className = "" }: PageHeaderProps) {
  return <header className={`ui-page-header ${className}`.trim()}>
    <div className="ui-page-header-main">
      {leading}
      <div className="ui-page-header-copy">
        {eyebrow && <span className="ui-page-header-eyebrow">{eyebrow}</span>}
        <div className="ui-page-header-title"><h1>{title}</h1>{titleAction}</div>
        {description && <p>{description}</p>}
      </div>
    </div>
    {navigation && <div className="ui-page-header-navigation">{navigation}</div>}
    {actions && <div className="ui-page-header-actions">{actions}</div>}
  </header>
}
