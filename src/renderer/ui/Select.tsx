import { Check, ChevronDown } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

export interface SelectOption { value: string; label: ReactNode }
export type SelectColor = "normal" | "primary" | "danger" | "success" | "warning" | "neutral"

export function useSelectDropdown() {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [position, setPosition] = useState({ left: 0, width: 0, top: 0, bottom: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const upward = window.innerHeight - rect.bottom < 240 && rect.top > 240
      setOpenUp(upward)
      setPosition({ left: rect.left, width: rect.width, top: rect.bottom + 6, bottom: window.innerHeight - rect.top + 6 })
    }
    place()
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    window.addEventListener("resize", place)
    document.addEventListener("scroll", place, true)
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true) }
  }, [open])
  return { open, openUp, position, ref, menuRef, setOpen }
}

export function Select({ value, options, onValueChange, placeholder = "Select…", disabled = false, autoFocus = false, color = "normal", className, title, trigger, ariaLabel, menuWidth }: { value?: string; options: SelectOption[]; onValueChange(value: string): void; placeholder?: string; disabled?: boolean; autoFocus?: boolean; color?: SelectColor; className?: string; title?: string; trigger?: ReactNode; ariaLabel?: string; menuWidth?: number }) {
  const dropdown = useSelectDropdown()
  const selected = options.find(option => option.value === value)
  return <div className={["schema-select", `select-color-${color}`, dropdown.open && "open", dropdown.openUp && "open-up", className].filter(Boolean).join(" ")} ref={dropdown.ref}>
    <button type="button" title={title} aria-label={ariaLabel} disabled={disabled} autoFocus={autoFocus} aria-haspopup="listbox" aria-expanded={dropdown.open} onClick={() => dropdown.setOpen(current => !current)}>{trigger ?? <><span className={!selected ? "placeholder" : ""}>{selected?.label ?? placeholder}</span><ChevronDown /></>}</button>
    {dropdown.open && createPortal(<div ref={dropdown.menuRef} className={`schema-select-menu schema-select-portal select-menu-color-${color}`} style={{ left: menuWidth ? Math.max(8, Math.min(dropdown.position.left + dropdown.position.width - menuWidth, window.innerWidth - menuWidth - 8)) : dropdown.position.left, width: menuWidth ?? dropdown.position.width, top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }} role="listbox">{options.map(option => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? "selected" : ""} onClick={() => { onValueChange(option.value); dropdown.setOpen(false) }} key={option.value}><span>{option.label}</span>{option.value === value && <Check />}</button>)}</div>, document.body)}
  </div>
}
