export interface ToggleProps {
  checked: boolean
  onCheckedChange(checked: boolean): void
  ariaLabel: string
  disabled?: boolean
  autoFocus?: boolean
  name?: string
  variant?: "switch" | "button"
  checkedLabel?: string
  uncheckedLabel?: string
}

/** Reusable accessible switch used by forms and standalone controls. */
export function Toggle({ checked, onCheckedChange, ariaLabel, disabled = false, autoFocus = false, name, variant = "switch", checkedLabel = "On", uncheckedLabel = "Off" }: ToggleProps) {
  return <label className={`getgo-toggle getgo-toggle-${variant}`}><input name={name} type="checkbox" role="switch" aria-label={ariaLabel} checked={checked} disabled={disabled} autoFocus={autoFocus} onChange={event => onCheckedChange(event.target.checked)} /><i aria-hidden="true" />{variant === "button" && <span>{checked ? checkedLabel : uncheckedLabel}</span>}</label>
}
