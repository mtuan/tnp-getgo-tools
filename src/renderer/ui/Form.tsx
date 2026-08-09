import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, ImagePlus, X } from "lucide-react"
import { Select, useSelectDropdown, type SelectOption } from "./Select"
import { SegmentedControl } from "./SegmentedControl"
import { Toggle } from "./Toggle"

export type { SelectOption } from "./Select"
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
  | (FieldBase & { type: "text" | "email" | "password" | "url" | "tel" | "search" | "date"; placeholder?: string; autoComplete?: string })
  | (FieldBase & { type: "textarea"; placeholder?: string; rows?: number })
  | (FieldBase & { type: "image"; accept?: string; maxBytes?: number; previewSrc?: string })
  | (FieldBase & { type: "number"; min?: number; max?: number; step?: number; placeholder?: string })
  | (FieldBase & { type: "select"; options: SelectOption[]; placeholder?: string; presentation?: "auto" | "dropdown" | "segmented" })
  | (FieldBase & { type: "multi-select"; options: SelectOption[]; placeholder?: string })
  | (FieldBase & { type: "checkbox" })
  | (FieldBase & { type: "toggle"; presentation?: "default" | "row" })
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

function SelectControl({ field, value, disabled, autoFocus, onChange }: { field: Extract<FormField, { type: "select" }>; value: unknown; disabled: boolean; autoFocus: boolean; onChange(value: string): void }) {
  const segmented = field.presentation === "segmented" || (field.presentation !== "dropdown" && field.options.length >= 2 && field.options.length <= 4)
  if (segmented) return <SegmentedControl value={String(value ?? "")} options={field.options} disabled={disabled} autoFocus={autoFocus} ariaLabel={String(field.label ?? field.name)} onValueChange={onChange} />
  return <Select value={String(value ?? "")} options={field.options} disabled={disabled} autoFocus={autoFocus} placeholder={field.placeholder} onValueChange={onChange} />
}

function MultiSelectControl({ field, value, disabled, autoFocus, onChange }: { field: Extract<FormField, { type: "multi-select" }>; value: unknown; disabled: boolean; autoFocus: boolean; onChange(value: string[]): void }) {
  const dropdown = useSelectDropdown()
  const selected = Array.isArray(value) ? value.map(String) : []
  const toggle = (option: string) => onChange(selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option])
  return <div className={`schema-select schema-multi ${dropdown.open ? "open" : ""} ${dropdown.openUp ? "open-up" : ""}`} ref={dropdown.ref}>
    <button type="button" disabled={disabled} autoFocus={autoFocus} aria-haspopup="listbox" aria-expanded={dropdown.open} onClick={() => dropdown.setOpen(current => !current)}><span className={selected.length ? "schema-selected-values" : "placeholder"}>{selected.length ? selected.map(item => <i key={item}>{field.options.find(option => option.value === item)?.label ?? item}<X onClick={event => { event.stopPropagation(); toggle(item) }} /></i>) : field.placeholder ?? "Select options…"}</span><ChevronDown /></button>
    {dropdown.open && createPortal(<div ref={dropdown.menuRef} className="schema-select-menu schema-select-portal multi" style={{ left: dropdown.position.left, width: dropdown.position.width, top: dropdown.openUp ? "auto" : dropdown.position.top, bottom: dropdown.openUp ? dropdown.position.bottom : "auto" }} role="listbox" aria-multiselectable="true">{field.options.map(option => { const checked = selected.includes(option.value); return <button type="button" role="option" aria-selected={checked} className={checked ? "selected" : ""} onClick={() => toggle(option.value)} key={option.value}><span className="option-check">{checked && <Check />}</span><span>{option.label}</span></button> })}</div>, document.body)}
  </div>
}

function ImageControl({ field, value, disabled, autoFocus, onChange }: { field: Extract<FormField, { type: "image" }>; value: unknown; disabled: boolean; autoFocus: boolean; onChange(value: string): void }) {
  const [dragging, setDragging] = useState(false)
  const source = typeof value === "string" ? value : ""
  const directPreview = source.startsWith("data:image/") || source.startsWith("http://") || source.startsWith("https://")
  const previewSource = directPreview ? source : field.previewSrc ?? ""
  const load = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith("image/")) return
    if (field.maxBytes && file.size > field.maxBytes) return
    const reader = new FileReader()
    reader.onload = () => onChange(String(reader.result ?? ""))
    reader.readAsDataURL(file)
  }
  return <div className={`schema-image-field ${dragging ? "dragging" : ""}`}>
    <label
      className={`schema-image-select ${disabled ? "disabled" : ""}`}
      onDragEnter={event => { event.preventDefault(); if (!disabled) setDragging(true) }}
      onDragOver={event => { event.preventDefault(); if (!disabled) event.dataTransfer.dropEffect = "copy" }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) load(event.dataTransfer.files?.[0]) }}
    >
      {previewSource ? <img src={previewSource} alt="Selected image preview" /> : <ImagePlus />}
      <span>{source.startsWith("asset:") ? source.slice("asset:".length) : source ? "Replace image" : "Select or drop image"}</span>
      <input type="file" accept={field.accept ?? "image/png,image/jpeg,image/webp,image/svg+xml"} disabled={disabled} autoFocus={autoFocus} onChange={event => { load(event.target.files?.[0]); event.currentTarget.value = "" }} />
    </label>
    {source && <button type="button" className="schema-image-remove" disabled={disabled} aria-label="Remove selected image" title="Remove image" onClick={() => onChange("")}><X /></button>}
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
  if (field.type === "toggle") return <div className="schema-toggle-control"><Toggle name={field.name} ariaLabel={String(field.label ?? field.name)} checked={Boolean(value)} disabled={disabled} autoFocus={autoFocus} onCheckedChange={checked => onChange(field.name, checked)} /></div>
  if (field.type === "checkbox") return <label className="schema-checkbox"><input name={field.name} type="checkbox" checked={Boolean(value)} disabled={disabled} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.checked)} /><span>{field.label}</span></label>
  if (field.type === "textarea") return <textarea name={field.name} rows={field.rows} placeholder={field.placeholder} value={String(value ?? "")} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value)} />
  if (field.type === "image") return <ImageControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "select") return <SelectControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "multi-select") return <MultiSelectControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "number") return <input name={field.name} type="number" min={field.min} max={field.max} step={field.step} placeholder={field.placeholder} value={value === undefined || value === null ? "" : Number(value)} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value === "" ? undefined : Number(event.target.value))} />
  return <input name={field.name} type={field.type} autoComplete={field.autoComplete} placeholder={field.placeholder} value={String(value ?? "")} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value)} />
}

function Field({ field, values, errors, onChange, autoFocus }: { field: FormField; values: FormValues; errors: FormErrors; onChange(name: string, value: unknown): void; autoFocus: boolean }) {
  if (field.type === "toggle" && field.presentation === "row") return <div className={`schema-field schema-toggle-row ${errors[field.name] ? "invalid" : ""}`}>
    <div><label>{field.label}{field.required && <b>*</b>}</label>{errors[field.name] ? <small className="field-error">{errors[field.name]}</small> : field.helper ? <small>{field.helper}</small> : null}</div>
    <FormControl field={field} values={values} onChange={onChange} autoFocus={autoFocus} />
  </div>
  const inlineLabel = field.type === "checkbox"
  return <div className={`schema-field ${errors[field.name] ? "invalid" : ""}`}>
    {!inlineLabel && field.label && <label>{field.label}{field.required && <b>*</b>}</label>}
    <FormControl field={field} values={values} onChange={onChange} autoFocus={autoFocus} />
    {errors[field.name] ? <small className="field-error">{errors[field.name]}</small> : field.helper ? <small>{field.helper}</small> : null}
  </div>
}

export function Form({ fields, values, errors = {}, onChange, autoFocus = true, autoSelectSingleOption = true }: { fields: FormSchema[]; values: FormValues; errors?: FormErrors; onChange(name: string, value: unknown): void; autoFocus?: boolean; autoSelectSingleOption?: boolean }) {
  const formRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const parentForm = formRootRef.current?.closest("form")
    if (!parentForm) return
    const focusFirstError = () => window.requestAnimationFrame(() => {
      const control = formRootRef.current?.querySelector<HTMLElement>(".schema-field.invalid input:not([disabled]), .schema-field.invalid textarea:not([disabled]), .schema-field.invalid select:not([disabled]), .schema-field.invalid button:not([disabled]), .schema-field.invalid [tabindex]:not([tabindex='-1'])")
      if (!control) return
      control.focus({ preventScroll: true })
      control.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" })
    })
    parentForm.addEventListener("submit", focusFirstError)
    return () => parentForm.removeEventListener("submit", focusFirstError)
  }, [])
  useEffect(() => {
    if (!autoSelectSingleOption) return
    for (const field of flattenSchema(fields, values)) {
      if (field.type !== "select" || !field.required || field.options.length !== 1) continue
      const disabled = typeof field.disabled === "function" ? field.disabled(values) : field.disabled
      const current = values[field.name]
      if (!disabled && (current === undefined || current === null || current === "")) onChange(field.name, field.options[0].value)
    }
  }, [autoSelectSingleOption, fields, onChange, values])
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
  return <div className="schema-form" ref={formRootRef}>{fields.map((entry, index) => isSection(entry)
    ? (!entry.when || entry.when(values)) && <section className="schema-section" key={index}><header><h3>{entry.section}</h3>{entry.description && <p>{entry.description}</p>}</header>{entry.fields.map((row, rowIndex) => renderRow(row, `${index}-${rowIndex}`))}</section>
    : renderRow(entry, String(index)))}</div>
}
