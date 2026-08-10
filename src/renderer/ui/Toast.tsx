import { CheckCircle2, CircleAlert, Info, X } from "lucide-react"
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

type ToastVariant = "success" | "error" | "info"
interface ToastInput { title: string; description?: string; variant?: ToastVariant; action?: { label: string; onSelect(): void } }
interface ToastItem extends ToastInput { id: number; variant: ToastVariant }
interface ToastApi { show(input: ToastInput): void }
const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems(current => current.filter(item => item.id !== id)), [])
  const show = useCallback((input: ToastInput) => {
    const item: ToastItem = { ...input, id: Date.now() + Math.random(), variant: input.variant ?? "success" }
    setItems(current => [...current.slice(-2), item])
    window.setTimeout(() => dismiss(item.id), item.variant === "error" ? 6000 : 3200)
  }, [dismiss])
  const api = useMemo(() => ({ show }), [show])
  return <ToastContext.Provider value={api}>{children}<div className="toast-viewport" aria-live="polite">{items.map(item => { const Icon = item.variant === "success" ? CheckCircle2 : item.variant === "error" ? CircleAlert : Info; const content = <><Icon /><div><strong>{item.title}</strong>{item.description && <span>{item.description}</span>}</div></>; return <div className={`app-toast app-toast-${item.variant} ${item.action ? "is-actionable" : ""}`} role={item.variant === "error" ? "alert" : "status"} key={item.id}>{item.action ? <button className="app-toast-action" aria-label={item.action.label} onClick={() => { item.action?.onSelect(); dismiss(item.id); }}>{content}</button> : content}<button className="app-toast-dismiss" onClick={() => dismiss(item.id)} aria-label="Dismiss notification"><X /></button></div> })}</div></ToastContext.Provider>
}

export function useToast(): ToastApi { const value = useContext(ToastContext); if (!value) throw new Error("useToast must be used inside ToastProvider"); return value }
