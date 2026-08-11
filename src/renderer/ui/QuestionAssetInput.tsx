import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react"
import { FolderOpen, ImagePlus, LoaderCircle, X } from "lucide-react"
import { Button } from "./Button"

const supported = /^image\/(?:avif|gif|jpeg|png|svg\+xml|webp)$/

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!supported.test(file.type)) { reject(new Error("Select a supported image file.")); return }
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image."))
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(file)
  })
}

export function QuestionAssetInput({ manifestPath, suggestedName, value, label, onChange }: {
  manifestPath: string
  suggestedName: string
  value?: string
  label: string
  onChange(value: string): void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState("")
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    if (!value?.startsWith("asset:")) { setPreview(""); return }
    let active = true
    void window.getgo.readQuizAsset(manifestPath, value)
      .then(source => { if (active) setPreview(source) })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)) })
    return () => { active = false }
  }, [manifestPath, value])
  const save = async (file?: File) => {
    if (!file) return
    setBusy(true); setError("")
    try {
      const result = await window.getgo.saveQuizAsset(manifestPath, suggestedName, await fileDataUrl(file))
      setPreview(result.preview)
      onChange(result.reference)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const pastedFile = (event: ClipboardEvent) => {
    const file = [...event.clipboardData.items].find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile()
    if (!file) return
    event.preventDefault()
    void save(file)
  }
  const droppedFile = (event: DragEvent) => {
    event.preventDefault(); setDragging(false)
    void save(event.dataTransfer.files[0])
  }
  return <div className={`question-asset-input ${dragging ? "dragging" : ""}`} tabIndex={0} role="group" aria-label={label} onClick={event => event.currentTarget.focus()} onPaste={pastedFile} onDragEnter={event => { event.preventDefault(); setDragging(true) }} onDragOver={event => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={droppedFile}>
    <div className="question-asset-value">
      {busy ? <LoaderCircle className="spin" /> : preview ? <img src={preview} alt={label} /> : <ImagePlus />}
      <span>{value || "Focus here to paste, or drop an image"}</span>
    </div>
    <Button variant="icon" color="primary" icon={<FolderOpen />} title={`Browse ${label}`} aria-label={`Browse ${label}`} disabled={busy} onClick={event => { event.stopPropagation(); inputRef.current?.click() }} />
    {value && <Button variant="icon" color="danger" icon={<X />} title={`Remove ${label}`} aria-label={`Remove ${label}`} onClick={() => { setPreview(""); onChange("") }} />}
    <input ref={inputRef} type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/svg+xml,image/webp" hidden onChange={event => { void save(event.target.files?.[0]); event.currentTarget.value = "" }} />
    {error && <small className="field-error">{error}</small>}
  </div>
}
