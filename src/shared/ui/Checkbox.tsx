import { useEffect, useRef } from "react";

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  onCheckedChange(checked: boolean): void;
}

export function Checkbox({ checked, indeterminate = false, ariaLabel, disabled, onCheckedChange }: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={inputRef}
      className="ui-checkbox"
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  );
}
