import type { ReactNode } from "react"
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs"

export interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  breadcrumbs?: BreadcrumbItem[]
  description?: ReactNode
  leading?: ReactNode
  titleAction?: ReactNode
  navigation?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, breadcrumbs, description, leading, titleAction, navigation, actions, className = "" }: PageHeaderProps) {
  return <header className={`ui-page-header ${className}`.trim()}>
    <div className="ui-page-header-main">
      {leading}
      <div className="ui-page-header-copy">
        {eyebrow && <span className="ui-page-header-eyebrow">{eyebrow}</span>}
        <div className="ui-page-header-title">{breadcrumbs?.length ? <><Breadcrumbs items={[...breadcrumbs, { label: title }]} /><h1 className="visually-hidden">{title}</h1></> : <h1>{title}</h1>}{titleAction}</div>
        {description && <p>{description}</p>}
      </div>
    </div>
    {(navigation || actions) && <div className="ui-page-header-controls">{navigation && <div className="ui-page-header-navigation">{navigation}</div>}{actions && <div className="ui-page-header-actions">{actions}</div>}</div>}
  </header>
}
