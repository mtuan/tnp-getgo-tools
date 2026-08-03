export interface ToggleProps {
  checked: boolean
  onCheckedChange(checked: boolean): void
  ariaLabel: string
  disabled?: boolean
  autoFocus?: boolean
  name?: string
}

/** Reusable accessible switch used by forms and standalone controls. */
export function Toggle({ checked, onCheckedChange, ariaLabel, disabled = false, autoFocus = false, name }: ToggleProps) {
  return <label className="getgo-toggle"><input name={name} type="checkbox" role="switch" aria-label={ariaLabel} checked={checked} disabled={disabled} autoFocus={autoFocus} onChange={event => onCheckedChange(event.target.checked)} /><i aria-hidden="true" /></label>
}
