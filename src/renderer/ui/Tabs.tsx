import type { ReactNode } from "react"

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  badge?: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange(value: T): void
  ariaLabel: string
  className?: string
  variant?: "segmented" | "underline"
}

export function Tabs<T extends string>({ items, value, onChange, ariaLabel, className = "", variant = "segmented" }: TabsProps<T>) {
  return <div className={`ui-tabs ui-tabs-${variant} ${className}`.trim()} role="tablist" aria-label={ariaLabel}>{items.map(item => <button type="button" role="tab" aria-selected={value === item.id} disabled={item.disabled} className={value === item.id ? "active" : ""} onClick={() => onChange(item.id)} key={item.id}>{item.icon}{item.label}{item.badge !== undefined && <span className="ui-tab-badge">{item.badge}</span>}</button>)}</div>
}
