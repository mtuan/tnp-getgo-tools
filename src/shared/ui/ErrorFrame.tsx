import { AlertTriangle, Check, Copy, X } from "lucide-react"
import { useState } from "react"
import { useToast } from "./Toast"

export function ErrorFrame({ message, copyValue = message, className = "", onDismiss, copyText }: { message: string; copyValue?: string; className?: string; onDismiss?: () => void; copyText?: { label: string; copied: string; successTitle: string; successDescription: string; failedTitle: string } }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  async function copyError() {
    try {
      await window.getgo.copyText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
      toast.show({ title: copyText?.successTitle ?? "Error copied", description: copyText?.successDescription ?? "The complete error message was copied to the clipboard.", variant: "info" })
    } catch (cause) {
      toast.show({ title: copyText?.failedTitle ?? "Could not copy error", description: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    }
  }
  return <div className={`ui-error-frame${onDismiss ? " has-dismiss" : ""} ${className}`.trim()} role="alert">
    <AlertTriangle aria-hidden="true" />
    <span>{message}</span>
    <button type="button" onClick={() => void copyError()} aria-label={copyText?.label ?? "Copy complete error"} title={copied ? copyText?.copied ?? "Copied" : copyText?.label ?? "Copy error"}>{copied ? <Check /> : <Copy />}</button>
    {onDismiss && <button type="button" onClick={onDismiss} aria-label="Dismiss error" title="Dismiss"><X /></button>}
  </div>
}
