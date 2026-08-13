import type { ReactNode } from "react";

export type StatusBadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

export function StatusBadge({ children, tone = "neutral", className = "", title, onClick, ariaLabel }: {
  children: ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
  title?: string;
  onClick?(): void;
  ariaLabel?: string;
}) {
  const classes = ["ui-status-badge", `ui-status-badge-${tone}`, onClick && "ui-status-badge-clickable", className].filter(Boolean).join(" ");
  return onClick
    ? <button type="button" className={classes} title={title} aria-label={ariaLabel} onClick={(event) => { event.stopPropagation(); onClick(); }}>{children}</button>
    : <span className={classes} title={title}>{children}</span>;
}
