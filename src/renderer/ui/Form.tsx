import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, X } from "lucide-react"

export interface SelectOption { value: string; label: ReactNode }
export interface FieldRules {
  pattern?: RegExp | { value: RegExp; message: string }
  minLength?: number | { value: number; message: string }
  maxLength?: number | { value: number; message: string }
  validate?: (value: unknown, values: FormValues) => string | null
}

interface FieldBase {
  name: string
  label?: ReactNode
  helper?: ReactNode
  required?: boolean
  readOnly?: boolean
  disabled?: boolean | ((values: FormValues) => boolean)
  when?: (values: FormValues) => boolean
  rules?: FieldRules
}

export type FormField =
  | (FieldBase & { type: "text" | "email" | "url" | "tel" | "search"; placeholder?: string })
  | (FieldBase & { type: "textarea"; placeholder?: string; rows?: number })
  | (FieldBase & { type: "number"; min?: number; max?: number; step?: number; placeholder?: string })
  | (FieldBase & { type: "select"; options: SelectOption[]; placeholder?: string })
  | (FieldBase & { type: "multi-select"; options: SelectOption[] })
  | (FieldBase & { type: "checkbox" })
  | (FieldBase & { type: "toggle" })
  | (FieldBase & { type: "custom"; render: (context: { value: unknown; values: FormValues; disabled: boolean; onChange(value: unknown): void }) => ReactNode })

export type FormRow = FormField | FormField[]
export interface FormSection { section: ReactNode; description?: ReactNode; fields: FormRow[]; when?: (values: FormValues) => boolean }
export type FormSchema = FormRow | FormSection
export type FormValues = Record<string, unknown>
export type FormErrors = Record<string, string>

const isSection = (entry: FormSchema): entry is FormSection => !Array.isArray(entry) && "section" in entry
const visible = (field: FormField, values: FormValues) => !field.when || field.when(values)

export function flattenSchema(schema: FormSchema[], values?: FormValues): FormField[] {
  const fields: FormField[] = []
  for (const entry of schema) {
    if (isSection(entry)) {
      if (values && entry.when && !entry.when(values)) continue
      for (const row of entry.fields) fields.push(...(Array.isArray(row) ? row : [row]))
    } else fields.push(...(Array.isArray(entry) ? entry : [entry]))
  }
  return values ? fields.filter(field => visible(field, values)) : fields
}

const ruleValue = <T,>(rule: T | { value: T; message: string }) => typeof rule === "object" && rule !== null && "value" in rule ? rule.value : rule
const ruleMessage = <T,>(rule: T | { value: T; message: string }, fallback: string) => typeof rule === "object" && rule !== null && "message" in rule ? rule.message : fallback

function useDropdown() {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [position, setPosition] = useState({ left: 0, width: 0, top: 0, bottom: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const place = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const upward = window.innerHeight - rect.bottom < 240 && rect.top > 240
      setOpenUp(upward)
      setPosition({ left: rect.left, width: rect.width, top: rect.bottom + 6, bottom: window.innerHeight - rect.top + 6 })
    }
    place()
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", close)
    window.addEventListener("resize", place)
    document.addEventListener("scroll", place, true)
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("resize", place); document.removeEventListener("scroll", place, true) }
  }, [open])
  return { open, openUp, position, ref, menuRef, setOpen }
}

function SelectControl({ field, value, disabled, onChange }: { field: Extract<FormField, { type: "select" }>; value: unknown; disabled: boolean; onChange(value: string): void }) {
  const dropdown = useDropdown()
  const selected = field.options.find(option => option.value === String(value ?? ""))
  return <div className={`schema-select ${dropdown.open ? "open" : ""} ${dropdown.openUp ? "open-up" : ""}`} ref={dropdown.ref}>
    <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={dropdown.open} onClick={() => dropdown.setOpen(current => !current)}><span className={!selected ? "placeholder" : ""}>{selected?.label ?? field.placeholder ?? "Select…"}</span><ChevronDown /></button>
    {dropdown.open && createPortal(<div ref={dropdown.menuRef} className="schema-select-menu schema-select-portal" style={{ left: dropdown.position.left, width: dropdown.position.width, top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }} role="listbox">{field.options.map(option => <button type="button" role="option" aria-selected={option.value === String(value ?? "")} className={option.value === String(value ?? "") ? "selected" : ""} onClick={() => { onChange(option.value); dropdown.setOpen(false) }} key={option.value}><span>{option.label}</span>{option.value === String(value ?? "") && <Check />}</button>)}</div>, document.body)}
  </div>
}

function MultiSelectControl({ field, value, disabled, onChange }: { field: Extract<FormField, { type: "multi-select" }>; value: unknown; disabled: boolean; onChange(value: string[]): void }) {
  const dropdown = useDropdown()
  const selected = Array.isArray(value) ? value.map(String) : []
  const toggle = (option: string) => onChange(selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option])
  return <div className={`schema-select schema-multi ${dropdown.open ? "open" : ""} ${dropdown.openUp ? "open-up" : ""}`} ref={dropdown.ref}>
    <button type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={dropdown.open} onClick={() => dropdown.setOpen(current => !current)}><span className={selected.length ? "schema-selected-values" : "placeholder"}>{selected.length ? selected.map(item => <i key={item}>{field.options.find(option => option.value === item)?.label ?? item}<X onClick={event => { event.stopPropagation(); toggle(item) }} /></i>) : "Select grades…"}</span><ChevronDown /></button>
    {dropdown.open && createPortal(<div ref={dropdown.menuRef} className="schema-select-menu schema-select-portal multi" style={{ left: dropdown.position.left, width: dropdown.position.width, top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }} role="listbox" aria-multiselectable="true">{field.options.map(option => { const checked = selected.includes(option.value); return <button type="button" role="option" aria-selected={checked} className={checked ? "selected" : ""} onClick={() => toggle(option.value)} key={option.value}><span className="option-check">{checked && <Check />}</span><span>{option.label}</span></button> })}</div>, document.body)}
  </div>
}

export function validateSchema(schema: FormSchema[], values: FormValues): FormErrors {
  const errors: FormErrors = {}
  for (const field of flattenSchema(schema, values)) {
    if (typeof field.disabled === "function" ? field.disabled(values) : field.disabled) continue
    const value = values[field.name]
    const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)
    if (field.required && empty) { errors[field.name] = `${String(field.label ?? field.name)} is required.`; continue }
    if (empty) continue
    if (field.rules?.pattern) {
      const pattern = ruleValue(field.rules.pattern); pattern.lastIndex = 0
      if (!pattern.test(String(value))) { errors[field.name] = ruleMessage(field.rules.pattern, `${String(field.label ?? field.name)} has an invalid format.`); continue }
    }
    if (field.rules?.minLength && String(value).length < ruleValue(field.rules.minLength)) { errors[field.name] = ruleMessage(field.rules.minLength, `${String(field.label ?? field.name)} is too short.`); continue }
    if (field.rules?.maxLength && String(value).length > ruleValue(field.rules.maxLength)) { errors[field.name] = ruleMessage(field.rules.maxLength, `${String(field.label ?? field.name)} is too long.`); continue }
    const customError = field.rules?.validate?.(value, values)
    if (customError) errors[field.name] = customError
  }
  return errors
}

export function FormControl({ field, values, onChange, autoFocus = false }: { field: FormField; values: FormValues; onChange(name: string, value: unknown): void; autoFocus?: boolean }) {
  const value = values[field.name]
  const disabled = typeof field.disabled === "function" ? field.disabled(values) : Boolean(field.disabled)
  if (field.type === "custom") return field.render({ value, values, disabled, onChange: next => onChange(field.name, next) })
  if (field.type === "toggle") return <div className="schema-toggle-control"><label className="getgo-toggle"><input name={field.name} type="checkbox" role="switch" aria-label={String(field.label ?? field.name)} checked={Boolean(value)} disabled={disabled} onChange={event => onChange(field.name, event.target.checked)} /><i aria-hidden="true" /></label></div>
  if (field.type === "checkbox") return <label className="schema-checkbox"><input name={field.name} type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={event => onChange(field.name, event.target.checked)} /><span>{field.label}</span></label>
  if (field.type === "textarea") return <textarea name={field.name} rows={field.rows} placeholder={field.placeholder} value={String(value ?? "")} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value)} />
  if (field.type === "select") return <SelectControl field={field} value={value} disabled={disabled} onChange={next => onChange(field.name, next)} />
  if (field.type === "multi-select") return <MultiSelectControl field={field} value={value} disabled={disabled} onChange={next => onChange(field.name, next)} />
  if (field.type === "number") return <input name={field.name} type="number" min={field.min} max={field.max} step={field.step} placeholder={field.placeholder} value={value === undefined || value === null ? "" : Number(value)} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value === "" ? undefined : Number(event.target.value))} />
  return <input name={field.name} type={field.type} placeholder={field.placeholder} value={String(value ?? "")} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value)} />
}

function Field({ field, values, errors, onChange, autoFocus }: { field: FormField; values: FormValues; errors: FormErrors; onChange(name: string, value: unknown): void; autoFocus: boolean }) {
  const inlineLabel = field.type === "checkbox"
  return <div className={`schema-field ${errors[field.name] ? "invalid" : ""}`}>
    {!inlineLabel && field.label && <label>{field.label}{field.required && <b>*</b>}</label>}
    <FormControl field={field} values={values} onChange={onChange} autoFocus={autoFocus} />
    {errors[field.name] ? <small className="field-error">{errors[field.name]}</small> : field.helper ? <small>{field.helper}</small> : null}
  </div>
}

export function Form({ fields, values, errors = {}, onChange, autoFocus = true }: { fields: FormSchema[]; values: FormValues; errors?: FormErrors; onChange(name: string, value: unknown): void; autoFocus?: boolean }) {
  let focused = false
  const renderField = (field: FormField) => {
    if (!visible(field, values)) return null
    const shouldFocus = autoFocus && !focused && !field.readOnly && !(typeof field.disabled === "function" ? field.disabled(values) : field.disabled)
    if (shouldFocus) focused = true
    return <Field key={field.name} field={field} values={values} errors={errors} onChange={onChange} autoFocus={shouldFocus} />
  }
  const renderRow = (row: FormRow, key: string) => {
    const rowFields = (Array.isArray(row) ? row : [row]).filter(field => visible(field, values))
    if (!rowFields.length) return null
    return <div className={rowFields.length > 1 ? "schema-row" : "schema-row single"} key={key}>{rowFields.map(renderField)}</div>
  }
  return <div className="schema-form">{fields.map((entry, index) => isSection(entry)
    ? (!entry.when || entry.when(values)) && <section className="schema-section" key={index}><header><h3>{entry.section}</h3>{entry.description && <p>{entry.description}</p>}</header>{entry.fields.map((row, rowIndex) => renderRow(row, `${index}-${rowIndex}`))}</section>
    : renderRow(entry, String(index)))}</div>
}
