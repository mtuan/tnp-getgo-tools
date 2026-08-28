import { createPortal } from "react-dom";
import { useId } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useSelectDropdown, type SelectOption } from "./Select";

export interface MultiSelectProps {
  value: string[];
  options: SelectOption[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  presentation?: "badges" | "text";
  onValueChange(value: string[]): void;
}

export function MultiSelect({
  value,
  options,
  ariaLabel,
  placeholder = "Select options…",
  className = "",
  disabled = false,
  autoFocus = false,
  presentation = "badges",
  onValueChange,
}: MultiSelectProps) {
  const dropdown = useSelectDropdown();
  const menuId = useId();
  const toggle = (option: string) =>
    onValueChange(
      value.includes(option)
        ? value.filter((item) => item !== option)
        : [...value, option],
    );
  const selectedLabels = value.map(
    (item) => options.find((option) => option.value === item)?.label ?? item,
  );
  return (
    <div
      className={`schema-select schema-multi schema-multi-${presentation} ${dropdown.open ? "open" : ""} ${dropdown.openUp ? "open-up" : ""} ${className}`.trim()}
      ref={dropdown.ref}
    >
      <button
        ref={dropdown.triggerRef}
        type="button"
        role="combobox"
        disabled={disabled}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={dropdown.open}
        onKeyDown={dropdown.onTriggerKeyDown}
        onClick={() => dropdown.setOpen((current) => !current)}
      >
        <span className={value.length ? (presentation === "badges" ? "schema-selected-values schema-selected-values-underlay" : "schema-selected-values") : "placeholder"}>
          {value.length
            ? presentation === "text"
              ? selectedLabels.join(", ")
              : selectedLabels.join(", ")
            : placeholder}
        </span>
        <ChevronDown />
      </button>
      {presentation === "badges" && value.length > 0 && (
        <span className="schema-multi-chip-layer">
          {value.map((item, index) => (
            <span className="schema-multi-chip" key={item}>
              <span>{selectedLabels[index]}</span>
              <button
                type="button"
                aria-label={`${ariaLabel}: ${String(selectedLabels[index])}`}
                title={`${ariaLabel}: ${String(selectedLabels[index])}`}
                disabled={disabled}
                onClick={() => toggle(item)}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          ))}
        </span>
      )}
      {dropdown.open &&
        createPortal(
          <div
            id={menuId}
            ref={dropdown.menuRef}
            className="schema-select-menu schema-select-portal multi"
            style={{
              left: dropdown.position.left,
              width: dropdown.position.width,
              top: dropdown.openUp ? "auto" : dropdown.position.top,
              bottom: dropdown.openUp ? dropdown.position.bottom : "auto",
            }}
            role="listbox"
            aria-label={ariaLabel}
            aria-multiselectable="true"
            onKeyDown={dropdown.onMenuKeyDown}
          >
            {options.map((option) => {
              const checked = value.includes(option.value);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={checked}
                  tabIndex={-1}
                  className={checked ? "selected" : ""}
                  onClick={() => toggle(option.value)}
                  key={option.value}
                >
                  <span className="option-check">{checked && <Check />}</span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
