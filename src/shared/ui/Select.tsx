import { Check, ChevronDown } from "lucide-react"
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"

export interface SelectOption { value: string; label: ReactNode }
export type SelectColor = "normal" | "primary" | "danger" | "success" | "warning" | "neutral"

export function useSelectDropdown() {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [position, setPosition] = useState({ left: 0, width: 0, top: 0, bottom: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef("")
  const typeaheadTimer = useRef<number | undefined>(undefined)

  const menuItems = () => Array.from(
    menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled), [role="menuitem"]:not(:disabled)') ?? [],
  )
  const focusItem = (edge: "first" | "last" | "selected" = "first") => {
    window.requestAnimationFrame(() => {
      const items = menuItems()
      const selected = edge === "selected" ? items.find(item => item.getAttribute("aria-selected") === "true") : undefined
      ;(selected ?? (edge === "last" ? items.at(-1) : items[0]))?.focus()
    })
  }
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus())
  }
  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    setOpen(true)
    focusItem(event.key === "ArrowUp" ? "last" : "selected")
  }
  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems()
    const current = document.activeElement instanceof HTMLButtonElement ? items.indexOf(document.activeElement) : -1
    if (event.key === "Escape") {
      event.preventDefault()
      close(true)
      return
    }
    if (event.key === "Tab") {
      close()
      return
    }
    const targetIndex = event.key === "ArrowDown" ? Math.min(current + 1, items.length - 1)
      : event.key === "ArrowUp" ? Math.max(current - 1, 0)
        : event.key === "Home" ? 0
          : event.key === "End" ? items.length - 1
            : -1
    if (targetIndex >= 0) {
      event.preventDefault()
      items[targetIndex]?.focus()
      return
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return
    window.clearTimeout(typeaheadTimer.current)
    typeahead.current += event.key.toLocaleLowerCase()
    const match = items.find(item => item.textContent?.trim().toLocaleLowerCase().startsWith(typeahead.current))
    match?.focus()
    typeaheadTimer.current = window.setTimeout(() => { typeahead.current = "" }, 500)
  }
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
    const closeOutside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", closeOutside)
    window.addEventListener("resize", place)
    document.addEventListener("scroll", place, true)
    return () => { document.removeEventListener("mousedown", closeOutside); window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true) }
  }, [open])
  useEffect(() => () => window.clearTimeout(typeaheadTimer.current), [])
  return { open, openUp, position, ref, triggerRef, menuRef, setOpen, close, focusItem, onTriggerKeyDown, onMenuKeyDown }
}

export function Select({ value, options, onValueChange, placeholder = "Select…", disabled = false, autoFocus = false, color = "normal", className, title, trigger, ariaLabel, menuWidth }: { value?: string; options: SelectOption[]; onValueChange(value: string): void; placeholder?: string; disabled?: boolean; autoFocus?: boolean; color?: SelectColor; className?: string; title?: string; trigger?: ReactNode; ariaLabel?: string; menuWidth?: number }) {
  const dropdown = useSelectDropdown()
  const menuId = useId()
  const selected = options.find(option => option.value === value)
  useEffect(() => {
    if (!dropdown.open) return
    const frame = window.requestAnimationFrame(() => {
      const selectedOption = dropdown.menuRef.current?.querySelector<HTMLElement>(
        '[role="option"][aria-selected="true"]',
      )
      selectedOption?.scrollIntoView({ block: "nearest" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [dropdown.open, dropdown.menuRef, value])
  return <div className={["schema-select", `select-color-${color}`, dropdown.open && "open", dropdown.openUp && "open-up", className].filter(Boolean).join(" ")} ref={dropdown.ref}>
    <button ref={dropdown.triggerRef} type="button" role="combobox" title={title} aria-label={ariaLabel} disabled={disabled} autoFocus={autoFocus} aria-haspopup="listbox" aria-controls={menuId} aria-expanded={dropdown.open} onKeyDown={dropdown.onTriggerKeyDown} onClick={() => dropdown.setOpen(current => !current)}>{trigger ?? <><span className={!selected ? "placeholder" : ""}>{selected?.label ?? placeholder}</span><ChevronDown /></>}</button>
    {dropdown.open && createPortal(<div id={menuId} ref={dropdown.menuRef} className={`schema-select-menu schema-select-portal select-menu-color-${color}`} style={{ left: menuWidth ? Math.max(8, Math.min(dropdown.position.left + dropdown.position.width - menuWidth, window.innerWidth - menuWidth - 8)) : dropdown.position.left, width: menuWidth ?? dropdown.position.width, top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }} role="listbox" onKeyDown={dropdown.onMenuKeyDown}>{options.map(option => <button type="button" role="option" aria-selected={option.value === value} tabIndex={-1} className={option.value === value ? "selected" : ""} onClick={() => { onValueChange(option.value); dropdown.close(true) }} key={option.value}><span>{option.label}</span>{option.value === value && <Check />}</button>)}</div>, document.body)}
  </div>
}
