import { createContext, useContext, useId, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

type AccordionGroupValue = {
  expandedId: string | null
  setExpandedId(id: string | null): void
}

const AccordionGroupContext = createContext<AccordionGroupValue | null>(null)

export function AccordionGroup({ defaultExpanded = null, children }: { defaultExpanded?: string | null; children: ReactNode }) {
  const [expandedId, setExpandedId] = useState<string | null>(defaultExpanded)
  return <AccordionGroupContext.Provider value={{ expandedId, setExpandedId }}>{children}</AccordionGroupContext.Provider>
}

export interface AccordionSectionProps {
  title: ReactNode
  description?: ReactNode
  expanded: boolean
  onExpandedChange(expanded: boolean): void
  actions?: ReactNode
  children: ReactNode
  className?: string
  variant?: "panel" | "inline"
  collapsible?: boolean
  groupId?: string
}

/** Controlled, accessible disclosure section with an optional action area. */
export function AccordionSection({ title, description, expanded, onExpandedChange, actions, children, className = "", variant = "panel", collapsible = true, groupId }: AccordionSectionProps) {
  const contentId = useId()
  const group = useContext(AccordionGroupContext)
  const grouped = Boolean(group && groupId)
  const isExpanded = collapsible ? (grouped ? group?.expandedId === groupId : expanded) : true
  const setExpanded = (open: boolean) => {
    if (grouped) group?.setExpandedId(open ? groupId ?? null : null)
    onExpandedChange(open)
  }
  return <section className={`ui-accordion ui-accordion-${variant} ${isExpanded ? "open" : ""} ${collapsible ? "" : "ui-accordion-static"} ${className}`.trim()}>
    <div className="ui-accordion-header">
      {collapsible ? <button type="button" className="ui-accordion-toggle" aria-expanded={isExpanded} aria-controls={contentId} onClick={() => setExpanded(!isExpanded)}>
        <ChevronDown aria-hidden="true" />
        <span><strong>{title}</strong>{description && <small>{description}</small>}</span>
      </button> : <div className="ui-accordion-toggle ui-accordion-static-heading"><span><strong>{title}</strong>{description && <small>{description}</small>}</span></div>}
      {isExpanded && actions && <div className="ui-accordion-actions">{actions}</div>}
    </div>
    <div className="ui-accordion-region" aria-hidden={!isExpanded} inert={!isExpanded}>
      <div className="ui-accordion-region-inner"><div className="ui-accordion-content" id={contentId}>{children}</div></div>
    </div>
  </section>
}
