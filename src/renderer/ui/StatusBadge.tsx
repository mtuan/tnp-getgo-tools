import type { ReactNode } from "react";

export type StatusBadgeTone = "neutral" | "primary" | "info" | "success" | "warning" | "danger";

export function StatusBadge({ children, tone = "neutral", className = "", title }: {
  children: ReactNode;
  tone?: StatusBadgeTone;
  className?: string;
  title?: string;
}) {
  return <span className={["ui-status-badge", `ui-status-badge-${tone}`, className].filter(Boolean).join(" ")} title={title}>{children}</span>;
}
