import { Search, X } from "lucide-react";
import { Button } from "./Button";

interface SearchFieldProps {
  value: string;
  placeholder: string;
  ariaLabel: string;
  clearLabel: string;
  className?: string;
  onValueChange(value: string): void;
}

export function SearchField({
  value,
  placeholder,
  ariaLabel,
  clearLabel,
  className = "",
  onValueChange,
}: SearchFieldProps) {
  return (
    <label className={`ui-search-field ${className}`.trim()}>
      <Search aria-hidden="true" />
      <input
        type="search"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value && (
        <Button
          variant="icon"
          color="neutral"
          aria-label={clearLabel}
          title={clearLabel}
          icon={<X />}
          onClick={() => onValueChange("")}
        />
      )}
    </label>
  );
}
