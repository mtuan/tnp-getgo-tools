import { useEffect, useState, type ReactNode } from "react"

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
  /** Tabs intentionally contain only a label and optional icon. Counts and
   * status badges belong inside the selected tab's content. */
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

export interface TabPanelItem<T extends string> {
  id: T
  content: ReactNode
}

export interface TabPanelsProps<T extends string> {
  items: TabPanelItem<T>[]
  value: T
  /** Mount each panel on first use and preserve its local state afterward. */
  preserveMounted?: boolean
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, ariaLabel, className = "", variant = "segmented" }: TabsProps<T>) {
  return <div className={`ui-tabs ui-tabs-${variant} ${className}`.trim()} role="tablist" aria-label={ariaLabel}>{items.map(item => <button type="button" role="tab" aria-selected={value === item.id} disabled={item.disabled} className={value === item.id ? "active" : ""} onClick={() => onChange(item.id)} key={item.id}>{item.icon}{item.label}</button>)}</div>
}

export function TabPanels<T extends string>({ items, value, preserveMounted = true, className = "" }: TabPanelsProps<T>) {
  const [visited, setVisited] = useState<Set<T>>(() => new Set([value]))
  useEffect(() => {
    if (!preserveMounted) return
    setVisited((current) => current.has(value) ? current : new Set(current).add(value))
  }, [preserveMounted, value])

  return <div className={["ui-tab-panels", className].filter(Boolean).join(" ")}>
    {items.map((item) => {
      const active = item.id === value
      if (!active && (!preserveMounted || !visited.has(item.id))) return null
      return <div role="tabpanel" hidden={!active} key={item.id}>{item.content}</div>
    })}
  </div>
}
