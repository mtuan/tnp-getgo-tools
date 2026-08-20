import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Check, FolderOpen, ImagePlus, Search, SmilePlus, X } from "lucide-react"
import { Select, type SelectOption } from "./Select"
import { MultiSelect } from "./MultiSelect"
import { SegmentedControl } from "./SegmentedControl"
import { Toggle } from "./Toggle"
import { Button } from "./Button"
import { Input } from "./Input"

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
  | (FieldBase & { type: "textarea"; placeholder?: string; rows?: number; autoCompact?: boolean; maxLines?: number })
  | (FieldBase & { type: "image"; accept?: string; maxBytes?: number; previewSrc?: string })
  | (FieldBase & { type: "icon"; accept?: string; maxBytes?: number; previewSrc?: string; symbols?: string[] })
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
  const selected = Array.isArray(value) ? value.map(String) : []
  return <MultiSelect value={selected} options={field.options} disabled={disabled} autoFocus={autoFocus} ariaLabel={String(field.label ?? field.name)} placeholder={field.placeholder} onValueChange={onChange} />
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

type IconSymbolItem = readonly [symbol: string, keywords: string]
const iconSymbolCategories: Array<{ name: string; items: IconSymbolItem[] }> = [
  { name: "Learning", items: [
    ["🔤", "alphabet letters abc language"], ["🔢", "digits numbers 123"], ["📚", "books reading library"], ["✏️", "pencil writing edit"], ["🎓", "graduation education school"], ["🧠", "brain thinking knowledge"], ["🧩", "puzzle learning game"], ["💡", "idea light learn"],
    ["📖", "open book reading"], ["📕", "red book textbook"], ["📘", "blue book textbook"], ["📗", "green book textbook"], ["📝", "memo note writing"], ["🖍️", "crayon drawing"], ["📐", "triangle ruler geometry"], ["📏", "ruler measure"],
    ["🏫", "school building education"], ["👩‍🏫", "teacher woman class"], ["👨‍🏫", "teacher man class"], ["🧑‍🎓", "student learner"], ["🔠", "uppercase capital letters"], ["🔡", "lowercase small letters"], ["🔣", "symbols characters"], ["🗒️", "notebook notes"],
  ] },
  { name: "Time & mathematics", items: [
    ["🕐", "clock time one"], ["⏰", "alarm clock time"], ["⏱️", "stopwatch timer speed"], ["🧮", "abacus mathematics calculate"], ["➕", "plus addition add"], ["➖", "minus subtraction"], ["✖️", "multiply multiplication times"], ["➗", "divide division"],
    ["🕘", "clock time nine"], ["🕛", "clock time twelve noon"], ["⌛", "hourglass time wait"], ["⏳", "hourglass running time"], ["🔟", "ten number digits"], ["💯", "hundred score number"], ["🟰", "equals equal mathematics"], ["♾️", "infinity mathematics"],
    ["📊", "chart graph statistics"], ["📈", "chart increasing graph"], ["📉", "chart decreasing graph"], ["🔺", "triangle geometry"], ["🔵", "circle geometry blue"], ["🟩", "square geometry green"], ["0️⃣", "zero number digit"], ["1️⃣", "one number digit"],
  ] },
  { name: "Awards & goals", items: [
    ["🏆", "trophy winner champion"], ["⭐", "star favorite reward"], ["🎯", "target goal focus"], ["🥇", "gold medal first"], ["🎖️", "medal award prize"], ["✅", "check complete correct"], ["🌟", "glowing star excellent"], ["🏅", "sports medal award"],
    ["🥈", "silver medal second"], ["🥉", "bronze medal third"], ["👑", "crown winner king queen"], ["💎", "diamond prize gem"], ["🎁", "gift present reward"], ["🎉", "celebration party success"], ["🎊", "confetti celebration"], ["🚩", "flag goal finish"],
    ["🏁", "finish flag goal race"], ["☑️", "checkbox checked done"], ["✔️", "check correct success"], ["💪", "strong effort achievement"], ["👏", "clap congratulations"], ["🙌", "celebrate success"], ["🔥", "fire streak excellent"], ["✨", "sparkles special achievement"],
  ] },
  { name: "Faces", items: [
    ["🙂", "smile happy friendly"], ["😀", "grin happy face"], ["😄", "laugh happy smile"], ["🤓", "student smart glasses"], ["🥳", "celebrate party face"], ["😎", "cool sunglasses face"], ["🤔", "thinking question face"], ["😊", "blush happy smile"],
    ["😁", "grin teeth happy"], ["😆", "laugh excited face"], ["😂", "laugh tears funny"], ["😍", "love heart eyes"], ["🤩", "star eyes amazed"], ["🥰", "love hearts happy"], ["😇", "angel good face"], ["🧐", "inspect monocle curious"],
    ["😮", "surprised wow face"], ["😴", "sleep tired face"], ["😢", "sad crying face"], ["😕", "confused face"], ["🙃", "upside down silly"], ["😉", "wink face"], ["🤗", "hug happy face"], ["🫡", "salute face"],
  ] },
  { name: "Activities & subjects", items: [
    ["🎨", "art colors palette"], ["🎵", "music song note"], ["⚽", "football soccer sport"], ["🚀", "rocket space science"], ["🌍", "earth geography world"], ["🔬", "microscope science biology"], ["💻", "computer technology coding"], ["🗣️", "language speaking voice"],
    ["🎹", "piano music instrument"], ["🎸", "guitar music instrument"], ["🎤", "microphone singing voice"], ["🎭", "theater drama acting"], ["🏀", "basketball sport"], ["🏈", "football american sport"], ["🎾", "tennis sport"], ["🏊", "swimming sport"],
    ["🧪", "test tube chemistry science"], ["🧬", "dna biology science"], ["⚗️", "laboratory chemistry science"], ["🪐", "planet space astronomy"], ["🌱", "plant nature biology"], ["🐾", "animal paw nature"], ["🗺️", "map geography travel"], ["🏛️", "history museum building"],
  ] },
]

function IconControl({ field, value, disabled, onChange }: { field: Extract<FormField, { type: "icon" }>; value: unknown; disabled: boolean; autoFocus: boolean; onChange(value: string): void }) {
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const source = typeof value === "string" ? value : ""
  const isImage = source.startsWith("asset:") || source.startsWith("data:image/") || source.startsWith("http://") || source.startsWith("https://")
  const previewSource = source.startsWith("data:image/") || source.startsWith("http://") || source.startsWith("https://") ? source : field.previewSrc ?? ""
  const load = (file?: File) => {
    if (!file || !file.type.startsWith("image/") || (field.maxBytes && file.size > field.maxBytes)) return
    const reader = new FileReader()
    reader.onload = () => { onChange(String(reader.result ?? "")); setOpen(false) }
    reader.readAsDataURL(file)
  }
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const categories = (field.symbols
    ? [{ name: "Symbols", items: field.symbols.map(symbol => [symbol, symbol] as const) }]
    : iconSymbolCategories
  ).map(category => ({
    ...category,
    items: normalizedSearch
      ? category.items.filter(([symbol, keywords]) => symbol.includes(normalizedSearch) || keywords.includes(normalizedSearch) || category.name.toLocaleLowerCase().includes(normalizedSearch))
      : category.items.slice(0, 16),
  })).filter(category => category.items.length)
  useEffect(() => {
    if (!open) return
    const close = () => { setOpen(false); setSearch("") }
    const pointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) close()
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("pointerdown", pointerDown)
    window.addEventListener("keydown", keyDown)
    return () => {
      document.removeEventListener("pointerdown", pointerDown)
      window.removeEventListener("keydown", keyDown)
    }
  }, [open])
  return <div ref={pickerRef} className={`schema-icon-picker ${dragging ? "dragging" : ""}`} tabIndex={0} role="group" aria-label={String(field.label ?? "Icon")}
    onDragEnter={event => { event.preventDefault(); if (!disabled) setDragging(true) }}
    onDragOver={event => { event.preventDefault(); if (!disabled) event.dataTransfer.dropEffect = "copy" }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
    onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled) load(event.dataTransfer.files?.[0]) }}>
    <div className="schema-icon-value">
      <span className="schema-icon-preview">{isImage && previewSource ? <img src={previewSource} alt="" /> : source && !isImage ? source : <ImagePlus />}</span>
      <span>{source ? isImage ? source.startsWith("asset:") ? source.slice(6) : "Selected image" : source : "Select an image or symbol"}</span>
    </div>
    <Button variant="icon" color="primary" icon={<FolderOpen />} title="Browse icon image" aria-label="Browse icon image" disabled={disabled} onClick={event => { event.stopPropagation(); inputRef.current?.click() }} />
    <Button variant="icon" color="neutral" icon={<SmilePlus />} title="Choose Unicode symbol" aria-label="Choose Unicode symbol" disabled={disabled} onClick={event => { event.stopPropagation(); setOpen(current => !current) }} />
    {source && <Button variant="icon" color="danger" icon={<X />} title="Remove icon" aria-label="Remove icon" disabled={disabled} onClick={() => onChange("")} />}
    <input ref={inputRef} type="file" accept={field.accept ?? "image/png,image/jpeg,image/webp,image/svg+xml"} hidden onChange={event => { load(event.target.files?.[0]); event.currentTarget.value = "" }} />
    {open && <div className="schema-icon-popover" role="dialog" aria-label="Choose icon">
      <div className="schema-icon-popover-header">
        <div><strong>Choose a symbol</strong><Button variant="icon" icon={<X />} aria-label="Close symbol picker" title="Close" onClick={() => setOpen(false)} /></div>
        <Input className="schema-icon-search" leftIcon={<Search />} autoFocus type="search" aria-label="Search symbols" placeholder="Search symbols" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <div className="schema-icon-categories">{categories.length ? categories.map(category => <section key={category.name}><h4>{category.name}</h4><div className="schema-icon-symbols">{category.items.map(([symbol, keywords]) => <button type="button" className={source === symbol ? "selected" : ""} aria-label={`Use ${keywords}`} title={keywords} onClick={() => { onChange(symbol); setOpen(false); setSearch("") }} key={symbol}><span>{symbol}</span>{source === symbol && <Check />}</button>)}</div></section>) : <p className="schema-icon-empty">No matching symbols.</p>}</div>
    </div>}
  </div>
}

function TextareaControl({ field, value, disabled, autoFocus, onChange }: {
  field: Extract<FormField, { type: "textarea" }>
  value: unknown
  disabled: boolean
  autoFocus: boolean
  onChange(value: string): void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const autoCompact = field.autoCompact ?? true
  const maxLines = field.maxLines ?? 3
  const resize = () => {
    const element = ref.current
    if (!element || !autoCompact) return
    element.style.height = "auto"
    const styles = window.getComputedStyle(element)
    const lineHeight = Number.parseFloat(styles.lineHeight) || Number.parseFloat(styles.fontSize) * 1.5
    const verticalChrome = Number.parseFloat(styles.paddingTop)
      + Number.parseFloat(styles.paddingBottom)
      + Number.parseFloat(styles.borderTopWidth)
      + Number.parseFloat(styles.borderBottomWidth)
    const maximum = lineHeight * Math.max(1, maxLines) + verticalChrome
    element.style.height = `${Math.min(element.scrollHeight, maximum)}px`
    element.style.overflowY = element.scrollHeight > maximum ? "auto" : "hidden"
  }
  useLayoutEffect(resize, [autoCompact, maxLines, value])
  useEffect(() => {
    if (!autoCompact) return
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  })
  return <textarea
    ref={ref}
    className={autoCompact ? "auto-compact" : undefined}
    name={field.name}
    rows={autoCompact ? 1 : field.rows}
    placeholder={field.placeholder}
    value={String(value ?? "")}
    disabled={disabled}
    readOnly={field.readOnly}
    autoFocus={autoFocus}
    onChange={event => {
      onChange(event.target.value)
      window.requestAnimationFrame(resize)
    }}
  />
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
  if (field.type === "textarea") return <TextareaControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "image") return <ImageControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "icon") return <IconControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "select") return <SelectControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "multi-select") return <MultiSelectControl field={field} value={value} disabled={disabled} autoFocus={autoFocus} onChange={next => onChange(field.name, next)} />
  if (field.type === "number") {
    const numericValue = typeof value === "number" ? value : Number(value)
    return <input name={field.name} type="number" min={field.min} max={field.max} step={field.step} placeholder={field.placeholder} value={value === undefined || value === null || value === "" || !Number.isFinite(numericValue) ? "" : numericValue} disabled={disabled} readOnly={field.readOnly} autoFocus={autoFocus} onChange={event => onChange(field.name, event.target.value === "" ? undefined : Number(event.target.value))} />
  }
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
