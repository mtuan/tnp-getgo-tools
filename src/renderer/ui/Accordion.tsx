import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

export interface AccordionSectionProps {
  title: ReactNode
  description?: ReactNode
  expanded: boolean
  onExpandedChange(expanded: boolean): void
  actions?: ReactNode
  children: ReactNode
  className?: string
  variant?: "panel" | "inline"
}

/** Controlled, accessible disclosure section with an optional action area. */
export function AccordionSection({ title, description, expanded, onExpandedChange, actions, children, className = "", variant = "panel" }: AccordionSectionProps) {
  const contentId = useId()
  return <section className={`ui-accordion ui-accordion-${variant} ${expanded ? "open" : ""} ${className}`.trim()}>
    <div className="ui-accordion-header">
      <button type="button" className="ui-accordion-toggle" aria-expanded={expanded} aria-controls={contentId} onClick={() => onExpandedChange(!expanded)}>
        <ChevronDown aria-hidden="true" />
        <span><strong>{title}</strong>{description && <small>{description}</small>}</span>
      </button>
      {expanded && actions && <div className="ui-accordion-actions">{actions}</div>}
    </div>
    <div className="ui-accordion-region" aria-hidden={!expanded} inert={!expanded}>
      <div className="ui-accordion-region-inner"><div className="ui-accordion-content" id={contentId}>{children}</div></div>
    </div>
  </section>
}
