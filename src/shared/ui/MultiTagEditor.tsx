import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import { X } from "lucide-react"

export interface MultiTagEditorProps {
  value: string[]
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  onValueChange(value: string[]): void
}

const clean = (value: string) => value.trim().replace(/\s+/gu, " ")
const keyOf = (value: string) => clean(value).toLocaleLowerCase()

export function MultiTagEditor({ value, ariaLabel, placeholder = "Add an item…", disabled = false, autoFocus = false, onValueChange }: MultiTagEditorProps) {
  const [draft, setDraft] = useState("")
  const [editing, setEditing] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [editWidth, setEditWidth] = useState(0)
  const [editMinWidth, setEditMinWidth] = useState(0)
  const editRef = useRef<HTMLInputElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)

  useEffect(() => { editRef.current?.select() }, [editing])
  useLayoutEffect(() => {
    if (editing === null || !measureRef.current) return
    const measuredTextWidth = measureRef.current.getBoundingClientRect().width
    const requestedWidth = Math.max(editMinWidth, Math.ceil(measuredTextWidth) + 18)
    setEditWidth(requestedWidth)
  }, [editDraft, editMinWidth, editing])

  const add = (input = draft) => {
    const known = new Set(value.map(keyOf))
    const additions = input.split(/[\n,]+/u).map(clean).filter(item => item && !known.has(keyOf(item)))
    additions.forEach(item => known.add(keyOf(item)))
    if (additions.length) onValueChange([...value, ...additions])
    setDraft("")
  }
  const finishEdit = () => {
    if (editing === null) return
    const next = clean(editDraft)
    const duplicate = value.some((item, index) => index !== editing && keyOf(item) === keyOf(next))
    if (!next) onValueChange(value.filter((_item, index) => index !== editing))
    else if (!duplicate && value[editing] !== next) onValueChange(value.map((item, index) => index === editing ? next : item))
    setEditing(null)
    setEditDraft("")
  }
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") { event.preventDefault(); add() }
    else if (event.key === "Backspace" && !draft && value.length) onValueChange(value.slice(0, -1))
  }

  return <div className={`ui-multi-tag-editor ${disabled ? "disabled" : ""}`} aria-label={ariaLabel} aria-disabled={disabled || undefined}>
    <div className="ui-multi-tag-list">
      {value.map((tag, index) => editing === index
        ? <span className="ui-multi-tag editing" key={`edit-${index}`}>
            <span ref={measureRef} className="ui-multi-tag-measure" aria-hidden="true">{editDraft || " "}</span>
            <input ref={editRef} className="ui-multi-tag-edit" style={{ width: editWidth }} value={editDraft} disabled={disabled} aria-label={`Edit ${tag}`} onChange={event => setEditDraft(event.target.value)} onBlur={finishEdit} onKeyDown={event => {
              if (event.key === "Enter") { event.preventDefault(); finishEdit() }
              if (event.key === "Escape") { event.preventDefault(); setEditing(null); setEditDraft("") }
            }} />
          </span>
        : <span className="ui-multi-tag" key={`${tag}-${index}`}>
            <button type="button" className="ui-multi-tag-label" disabled={disabled} onClick={event => {
              const pill = event.currentTarget.closest<HTMLElement>(".ui-multi-tag")
              const width = pill?.getBoundingClientRect().width ?? event.currentTarget.getBoundingClientRect().width
              const styles = pill ? window.getComputedStyle(pill) : null
              const borders = styles ? Number.parseFloat(styles.borderLeftWidth) + Number.parseFloat(styles.borderRightWidth) : 0
              const innerWidth = width - borders
              setEditing(index); setEditDraft(tag); setEditMinWidth(innerWidth); setEditWidth(innerWidth)
            }}>{tag}</button>
            <button type="button" className="ui-multi-tag-remove" disabled={disabled} aria-label={`Remove ${tag}`} onClick={() => onValueChange(value.filter((_item, itemIndex) => itemIndex !== index))}><X /></button>
          </span>)}
      <span className="ui-multi-tag ui-multi-tag-add">
        <input className="ui-multi-tag-input" value={draft} disabled={disabled} autoFocus={autoFocus} aria-label={ariaLabel} placeholder={placeholder} onChange={event => setDraft(event.target.value)} onKeyDown={onInputKeyDown} onBlur={() => add()} onPaste={event => {
          const text = event.clipboardData.getData("text")
          if (!/[\n,]/u.test(text)) return
          event.preventDefault()
          add(`${draft}${text}`)
        }} />
      </span>
    </div>
  </div>
}
