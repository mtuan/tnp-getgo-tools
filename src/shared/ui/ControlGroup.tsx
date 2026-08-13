import type { HTMLAttributes } from "react";

export function ControlGroup({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-control-group ${className}`.trim()} {...props} />;
}
