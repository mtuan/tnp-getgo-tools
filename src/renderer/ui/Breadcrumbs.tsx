import { Fragment, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"

export interface BreadcrumbItem {
  label: ReactNode
  onClick?: () => void
}

export function Breadcrumbs({ items, ariaLabel = "Breadcrumb" }: { items: BreadcrumbItem[]; ariaLabel?: string }) {
  return <div className="ui-breadcrumbs manager-breadcrumbs" role="navigation" aria-label={ariaLabel}>{items.map((item, index) => <Fragment key={index}>{index > 0 && <ChevronRight aria-hidden="true" />}{item.onClick ? <button type="button" onClick={item.onClick}>{item.label}</button> : <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>}</Fragment>)}</div>
}
