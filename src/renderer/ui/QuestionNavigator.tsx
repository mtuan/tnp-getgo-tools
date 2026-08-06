import { ChevronLeft, ChevronRight } from "lucide-react"
import { createPortal } from "react-dom"
import { useEffect } from "react"
import { Button } from "./Button"
import { useSelectDropdown } from "./Select"

export interface QuestionNavigationItem {
  value: string
  label: string
  description?: string
  reviewed?: boolean
}

export function QuestionNavigator({ value, items, disabled = false, onValueChange }: {
  value: string
  items: QuestionNavigationItem[]
  disabled?: boolean
  onValueChange(value: string): void
}) {
  const dropdown = useSelectDropdown()
  const index = items.findIndex(item => item.value === value)
  const selected = items[index]
  useEffect(() => {
    if (!dropdown.open) return
    const frame = window.requestAnimationFrame(() => {
      dropdown.menuRef.current
        ?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
        ?.scrollIntoView({ block: "center" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dropdown.open, dropdown.menuRef, value])
  const reviewStatus = (item: QuestionNavigationItem) => <span className={`ui-question-navigator-review ${item.reviewed ? "reviewed" : "pending"}`}>{item.reviewed ? "Reviewed" : "Pending"}</span>
  const optionLabel = (item: QuestionNavigationItem) => <span className="ui-question-navigator-option"><span><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>{reviewStatus(item)}</span>
  return <div className={`ui-question-navigator ${dropdown.open ? "open" : ""}`} aria-label="Question navigation" ref={dropdown.ref}>
    <Button className="ui-question-navigator-step" variant="icon" icon={<ChevronLeft />} disabled={disabled || index <= 0} aria-label="Previous question" title="Previous question" onClick={() => onValueChange(items[index - 1].value)} />
    <button className="ui-question-navigator-trigger" type="button" disabled={disabled} aria-label="Select question" aria-haspopup="listbox" aria-expanded={dropdown.open} onClick={() => dropdown.setOpen(open => !open)}><strong>{selected?.label ?? "Select question"}</strong>{selected && reviewStatus(selected)}</button>
    <Button className="ui-question-navigator-step" variant="icon" icon={<ChevronRight />} disabled={disabled || index < 0 || index >= items.length - 1} aria-label="Next question" title="Next question" onClick={() => onValueChange(items[index + 1].value)} />
    {dropdown.open && createPortal(<div className="ui-question-navigator-menu" ref={dropdown.menuRef} role="listbox" style={{ left: dropdown.position.left, width: dropdown.position.width, top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }}>{items.map(item => <button type="button" role="option" aria-selected={item.value === value} className={item.value === value ? "selected" : ""} key={item.value} onClick={() => { onValueChange(item.value); dropdown.setOpen(false) }}>{optionLabel(item)}</button>)}</div>, document.body)}
  </div>
}
