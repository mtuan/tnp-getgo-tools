import { useState, type FormEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Save, Trash2, X } from "lucide-react"
import { Button } from "./Button"
import { ErrorFrame } from "./ErrorFrame"

export interface DialogFrameProps { title: string; busy: boolean; error: string | null; children: ReactNode; onClose(): void; onSubmit(event: FormEvent): void; onDelete?: () => Promise<void>; presentation?: "drawer" | "modal" | "embedded"; submitLabel?: string; embeddedFooter?: boolean; className?: string; hideFooter?: boolean }

export function DialogFrame({ title, busy, error, children, onClose, onSubmit, onDelete, presentation = "drawer", submitLabel = "Save", embeddedFooter = false, className = "", hideFooter = false }: DialogFrameProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  async function remove() { if (!onDelete) return; setDeleting(true); try { await onDelete() } finally { setDeleting(false) } }
  const dialog = <section className={`crud-dialog presentation-${presentation} ${className}`.trim()} role={presentation === "embedded" ? undefined : "dialog"} aria-modal={presentation === "embedded" ? undefined : "true"} aria-labelledby="crud-title"><header><h2 id="crud-title">{title}</h2>{presentation !== "embedded" && <button type="button" onClick={onClose} disabled={busy} aria-label="Close"><X /></button>}</header><form onSubmit={onSubmit}><div className="crud-body">{error && <ErrorFrame message={error} />}{children}</div>{!hideFooter && (presentation !== "embedded" || embeddedFooter) && <footer>{onDelete && <div className="delete-action">{confirmingDelete ? <><span>Move this item to Trash?</span><Button icon={<Trash2 />} loading={deleting} variant="danger" disabled={busy && !deleting} onClick={() => void remove()}>Move to Trash</Button><button type="button" className="text-button" disabled={busy} onClick={() => setConfirmingDelete(false)}>Cancel</button></> : <Button icon={<Trash2 />} variant="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>Delete</Button>}</div>}{presentation !== "embedded" && <button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button>}<Button icon={<Save />} loading={busy && !deleting} type="submit" variant="solid">{submitLabel}</Button></footer>}</form></section>
  if (presentation === "embedded") return dialog
  return createPortal(<div className={`crud-backdrop presentation-${presentation}`} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose() }}>{dialog}</div>, document.body)
}
