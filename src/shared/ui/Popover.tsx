import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

interface PopoverTriggerProps {
  ref: Ref<HTMLButtonElement>;
  "aria-controls": string;
  "aria-expanded": boolean;
  "aria-haspopup": "dialog";
  onClick(): void;
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
}

interface PopoverProps {
  label: string;
  trigger(props: PopoverTriggerProps): ReactNode;
  children: ReactNode;
  className?: string;
  width?: number;
}

export function Popover({ label, trigger, children, className = "", width = 300 }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, bottom: 8, openUp: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const openUp = window.innerHeight - rect.bottom < 360 && rect.top > 360;
      setPosition({
        left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
        top: rect.bottom + 8,
        bottom: window.innerHeight - rect.top + 8,
        openUp,
      });
    };
    const closeOutside = (event: MouseEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !contentRef.current?.contains(event.target as Node)) close();
    };
    place();
    window.requestAnimationFrame(() => contentRef.current?.focus());
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open, width]);

  const triggerProps: PopoverTriggerProps = {
    ref: triggerRef,
    "aria-controls": contentId,
    "aria-expanded": open,
    "aria-haspopup": "dialog",
    onClick: () => setOpen(current => !current),
    onKeyDown: event => {
      if (event.key !== "ArrowDown") return;
      event.preventDefault();
      setOpen(true);
    },
  };

  return <>
    {trigger(triggerProps)}
    {open && createPortal(<div
      id={contentId}
      ref={contentRef}
      className={`ui-popover ${className}`.trim()}
      style={{ left: position.left, width, top: position.openUp ? "auto" : position.top, bottom: position.openUp ? position.bottom : "auto" }}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
      }}
    >{children}</div>, document.body)}
  </>;
}
