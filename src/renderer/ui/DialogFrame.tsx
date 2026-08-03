import { useState, type FormEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Trash2, X } from "lucide-react"
import { ErrorFrame } from "./ErrorFrame"

export interface DialogFrameProps { title: string; busy: boolean; error: string | null; children: ReactNode; onClose(): void; onSubmit(event: FormEvent): void; onDelete?: () => Promise<void>; presentation?: "drawer" | "modal" | "embedded"; submitLabel?: string; embeddedFooter?: boolean; className?: string; hideFooter?: boolean }

export function DialogFrame({ title, busy, error, children, onClose, onSubmit, onDelete, presentation = "drawer", submitLabel = "Save", embeddedFooter = false, className = "", hideFooter = false }: DialogFrameProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const dialog = <section className={`crud-dialog presentation-${presentation} ${className}`.trim()} role={presentation === "embedded" ? undefined : "dialog"} aria-modal={presentation === "embedded" ? undefined : "true"} aria-labelledby="crud-title"><header><h2 id="crud-title">{title}</h2>{presentation !== "embedded" && <button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X /></button>}</header><form onSubmit={onSubmit}><div className="crud-body">{error && <ErrorFrame message={error} />}{children}</div>{!hideFooter && (presentation !== "embedded" || embeddedFooter) && <footer>{onDelete && <div className="delete-action">{confirmingDelete ? <><span>Move this item to Trash?</span><button type="button" className="danger" disabled={busy} onClick={() => void onDelete()}>Move to Trash</button><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>Cancel</button></> : <button type="button" className="danger ghost" disabled={busy} onClick={() => setConfirmingDelete(true)}><Trash2 />Delete</button>}</div>}{presentation !== "embedded" && <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button>}<button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button></footer>}</form></section>
  if (presentation === "embedded") return dialog
  return createPortal(<div className={`crud-backdrop presentation-${presentation}`} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>{dialog}</div>, document.body)
}
