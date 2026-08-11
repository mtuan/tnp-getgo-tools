import { useState } from "react"
import { EditTable, type EditColumnDef } from "../ui/EditTable"
import { Form, FormControl, type FormSchema } from "../ui/Form"
import { QuestionAssetInput } from "../ui/QuestionAssetInput"
import type { AnswerDetailsProps } from "./types"

interface ChoiceRow extends Record<string, unknown> { label: string; type: "text" | "image"; value: unknown; correct: boolean }
const correctKeys = (correct: unknown) => new Set(Array.isArray(correct) ? correct.map(String) : correct == null || correct === "" ? [] : [String(correct)])
function nextChoiceLabel(labels: string[]): string { for (let code = 65; code <= 90; code += 1) if (!labels.includes(String.fromCharCode(code))) return String.fromCharCode(code); return `Option ${labels.length + 1}` }
const emptyChoiceRows = (): ChoiceRow[] => ["A", "B", "C", "D", "E"].map(label => ({ label, type: "text", value: "", correct: false }))
const withTrailingEmptyChoice = (rows: ChoiceRow[]): ChoiceRow[] => {
  const last = rows.at(-1)
  if (!last || String(last.value ?? "").trim() === "") return rows
  return [...rows, { label: nextChoiceLabel(rows.map(row => row.label)), type: "text", value: "", correct: false }]
}

const columns: EditColumnDef<ChoiceRow>[] = [
  { key: "correct", dataKey: "correct", title: "Correct", width: 72, field: { name: "correct", type: "checkbox" } },
  { key: "label", dataKey: "label", title: "Option", width: 72, field: { name: "label", type: "text", readOnly: true }, renderView: value => <strong>{String(value)}</strong> },
  { key: "value", dataKey: "value", title: "Value", field: { name: "value", type: "text" } },
]

export function ChoiceAnswerDetails({ answer, onChange, manifestPath, questionNo }: AnswerDetailsProps) {
  const [rows, setRows] = useState<ChoiceRow[]>(() => {
    const correct = correctKeys(answer.correct)
    const choices = Object.entries(answer.choices ?? {})
    return choices.length
      ? choices.map(([label, value]) => ({ label, type: typeof value === "string" && value.startsWith("asset:") ? "image" : "text", value, correct: correct.has(label) }))
      : emptyChoiceRows()
  })
  const update = (next: ChoiceRow[]) => {
    const visibleRows = withTrailingEmptyChoice(next)
    setRows(visibleRows)
    const populated = visibleRows.filter(row => String(row.value ?? "").trim() !== "")
    const selected = populated.filter(row => row.correct).map(row => row.label)
    onChange({ ...answer, type: "choice", inputs: undefined, choices: Object.fromEntries(populated.map(row => [row.label, row.value])), correct: selected.length > 1 ? selected : selected[0] ?? "" })
  }
  const choiceColumns: EditColumnDef<ChoiceRow>[] = [
    ...columns.slice(0, 2) as EditColumnDef<ChoiceRow>[],
    { key: "type", dataKey: "type", title: "Type", width: 130, field: { name: "type", type: "select", presentation: "dropdown", options: [{ value: "text", label: "Text" }, { value: "image", label: "Image" }] } },
    {
      ...columns[2],
      title: "Answer",
      renderEdit: ({ row, rowIndex, onChange: change }) => row.type === "image" && manifestPath
        ? <QuestionAssetInput manifestPath={manifestPath} suggestedName={`question-${questionNo}-${row.label}`} value={String(row.value ?? "").startsWith("asset:") ? String(row.value) : undefined} label={`Choice ${row.label} image`} onChange={value => change("value", value)} />
        : <div
            className="choice-answer-value"
            onKeyDown={event => {
              if (event.key !== "Tab" || event.shiftKey) return
              event.preventDefault()
              const table = event.currentTarget.closest(".edit-table")
              window.requestAnimationFrame(() => {
                table?.querySelectorAll<HTMLInputElement>(".choice-answer-value input")[rowIndex + 1]?.focus()
              })
            }}
          >
            <FormControl field={{ name: "value", type: "text" }} values={row} onChange={(_name, value) => change("value", value)} />
          </div>,
    },
  ]
  const fields: FormSchema[] = [
    { name: "fixed", label: "Fixed order", helper: "Keep options in the displayed order instead of allowing them to be shuffled.", type: "toggle" },
    { name: "options", type: "custom", render: () => <EditTable<ChoiceRow> ariaLabel="Answer options" columns={choiceColumns} rows={rows} rowKey="label" emptyText="No answer options." onRowChange={(index, field, value) => { const next = [...rows]; next[index] = { ...next[index], [field]: value, ...(field === "type" ? { value: "" } : {}) } as ChoiceRow; update(next) }} onRowDelete={index => update(rows.filter((_, rowIndex) => rowIndex !== index))} /> },
  ]
  return <Form fields={fields} values={{ fixed: answer.fixed === true, options: rows }} autoFocus={false} onChange={(name, value) => { if (name === "fixed") onChange({ ...answer, type: "choice", fixed: Boolean(value) }) }} />
}
