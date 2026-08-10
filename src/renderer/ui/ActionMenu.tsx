import { ChevronDown, type LucideIcon } from "lucide-react"
import { createPortal } from "react-dom"
import { Button, type ButtonColor, type ButtonVariant } from "./Button"
import { useSelectDropdown } from "./Select"

export interface ActionMenuItem {
  id: string
  label: string
  icon?: LucideIcon
  disabled?: boolean
  color?: "normal" | "danger"
  onSelect(): void
}

export function ActionMenu({ label = "Actions", items, disabled = false, variant = "outline", color = "neutral" }: { label?: string; items: ActionMenuItem[]; disabled?: boolean; variant?: ButtonVariant; color?: ButtonColor }) {
  const dropdown = useSelectDropdown()
  return <div className="ui-action-menu-trigger" ref={dropdown.ref}>
    <Button variant={variant} color={color} disabled={disabled} aria-haspopup="menu" aria-expanded={dropdown.open} onClick={() => dropdown.setOpen(open => !open)}>{label}<ChevronDown size={14} /></Button>
    {dropdown.open && createPortal(<div ref={dropdown.menuRef} className="ui-action-menu" role="menu" style={{ right: Math.max(8, window.innerWidth - dropdown.position.left - dropdown.position.width), top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }}>
      {items.map(item => { const Icon = item.icon; return <button type="button" role="menuitem" className={item.color === "danger" ? "danger" : ""} disabled={item.disabled} key={item.id} onClick={() => { dropdown.setOpen(false); item.onSelect() }}>{Icon && <Icon />}<span>{item.label}</span></button> })}
    </div>, document.body)}
  </div>
}
