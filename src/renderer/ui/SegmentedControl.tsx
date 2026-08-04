import type { SelectOption } from "./Select"

export function SegmentedControl({ value, options, onValueChange, disabled = false, autoFocus = false, ariaLabel, className }: { value?: string; options: SelectOption[]; onValueChange(value: string): void; disabled?: boolean; autoFocus?: boolean; ariaLabel?: string; className?: string }) {
  return <div className={["ui-segmented-control", className].filter(Boolean).join(" ")} role="radiogroup" aria-label={ariaLabel}>
    {options.map((option, index) => <button type="button" role="radio" aria-checked={option.value === value} className={option.value === value ? "selected" : ""} disabled={disabled} autoFocus={autoFocus && index === 0} onClick={() => onValueChange(option.value)} key={option.value}>{option.label}</button>)}
  </div>
}
