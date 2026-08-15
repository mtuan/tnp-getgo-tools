import { AlertTriangle, Check, Copy } from "lucide-react"
import { useState } from "react"
import { useToast } from "./Toast"

export function ErrorFrame({ message, copyValue = message, className = "" }: { message: string; copyValue?: string; className?: string }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  async function copyError() {
    try {
      await window.getgo.copyText(copyValue)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
      toast.show({ title: "Error copied", description: "The complete error message was copied to the clipboard.", variant: "info" })
    } catch (cause) {
      toast.show({ title: "Could not copy error", description: cause instanceof Error ? cause.message : String(cause), variant: "error" })
    }
  }
  return <div className={`ui-error-frame ${className}`.trim()} role="alert">
    <AlertTriangle aria-hidden="true" />
    <span>{message}</span>
    <button type="button" onClick={() => void copyError()} aria-label="Copy complete error" title={copied ? "Copied" : "Copy error"}>{copied ? <Check /> : <Copy />}</button>
  </div>
}
