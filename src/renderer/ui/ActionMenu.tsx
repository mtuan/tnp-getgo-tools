import { ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import { Button, type ButtonColor, type ButtonVariant } from "./Button";
import { TableActionButton } from "./TableActionButton";
import { useSelectDropdown } from "./Select";

export interface ActionMenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  type?: "item" | "label";
  disabled?: boolean;
  color?: "normal" | "danger";
  onSelect(): void;
}

export function ActionMenu({
  label = "Actions",
  items,
  disabled = false,
  variant = "outline",
  color = "neutral",
  iconOnly = false,
  buttonClassName = "",
}: {
  label?: string;
  items: ActionMenuItem[];
  disabled?: boolean;
  variant?: ButtonVariant;
  color?: ButtonColor;
  iconOnly?: boolean;
  buttonClassName?: string;
}) {
  const dropdown = useSelectDropdown();
  const triggerProps = {
    className: buttonClassName,
    color,
    disabled,
    "aria-label": iconOnly ? label : undefined,
    title: iconOnly ? label : undefined,
    "aria-haspopup": "menu" as const,
    "aria-expanded": dropdown.open,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      dropdown.setOpen((open) => !open);
    },
  };
  return (
    <div className="ui-action-menu-trigger" ref={dropdown.ref}>
      {iconOnly ? (
        <TableActionButton {...triggerProps} icon={<MoreHorizontal />} />
      ) : (
        <Button {...triggerProps} variant={variant}>
          {label}
          <ChevronDown size={14} />
        </Button>
      )}
      {dropdown.open &&
        createPortal(
          <div
            ref={dropdown.menuRef}
            className="ui-action-menu"
            role="menu"
            style={{
              right: Math.max(
                8,
                window.innerWidth -
                  dropdown.position.left -
                  dropdown.position.width,
              ),
              top: dropdown.openUp ? "auto" : dropdown.position.top,
              bottom: dropdown.openUp ? dropdown.position.bottom : "auto",
            }}
          >
            {items.map((item) => {
              if (item.type === "label")
                return (
                  <div className="ui-action-menu-label" key={item.id}>
                    {item.label}
                  </div>
                );
              const Icon = item.icon;
              const TrailingIcon = item.trailingIcon;
              return (
                <button
                  type="button"
                  role="menuitem"
                  className={item.color === "danger" ? "danger" : ""}
                  disabled={item.disabled}
                  key={item.id}
                  onClick={() => {
                    dropdown.setOpen(false);
                    item.onSelect();
                  }}
                >
                  {Icon && <Icon />}
                  <span>{item.label}</span>
                  {TrailingIcon && (
                    <TrailingIcon className="ui-action-menu-trailing-icon" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
