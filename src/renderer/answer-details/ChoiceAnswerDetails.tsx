import { useState } from "react"
import { EditTable, type EditColumnDef } from "../ui/EditTable"
import { Form, type FormSchema } from "../ui/Form"
import type { AnswerDetailsProps } from "./types"

interface ChoiceRow { label: string; value: unknown; correct: boolean }
const correctKeys = (correct: unknown) => new Set(Array.isArray(correct) ? correct.map(String) : correct == null || correct === "" ? [] : [String(correct)])
function nextChoiceLabel(labels: string[]): string { for (let code = 65; code <= 90; code += 1) if (!labels.includes(String.fromCharCode(code))) return String.fromCharCode(code); return `Option ${labels.length + 1}` }

const columns: EditColumnDef<ChoiceRow>[] = [
  { key: "correct", dataKey: "correct", title: "Correct", width: 72, field: { name: "correct", type: "checkbox" } },
  { key: "label", dataKey: "label", title: "Option", width: 72, field: { name: "label", type: "text", readOnly: true }, renderView: value => <strong>{String(value)}</strong> },
  { key: "value", dataKey: "value", title: "Value", field: { name: "value", type: "text" } },
]

export function ChoiceAnswerDetails({ answer, onChange }: AnswerDetailsProps) {
  const [rows, setRows] = useState<ChoiceRow[]>(() => {
    const correct = correctKeys(answer.correct)
    return Object.entries(answer.choices ?? {}).map(([label, value]) => ({ label, value, correct: correct.has(label) }))
  })
  const update = (next: ChoiceRow[]) => {
    setRows(next)
    const populated = next.filter(row => String(row.value ?? "").trim() !== "")
    const selected = populated.filter(row => row.correct).map(row => row.label)
    onChange({ ...answer, type: "choice", choices: Object.fromEntries(populated.map(row => [row.label, row.value])), correct: selected.length > 1 ? selected : selected[0] ?? "" })
  }
  const fields: FormSchema[] = [
    { name: "fixed", label: "Fixed order", helper: "Keep options in the displayed order instead of allowing them to be shuffled.", type: "toggle" },
    { name: "options", type: "custom", render: () => <EditTable<ChoiceRow> ariaLabel="Answer options" columns={columns} rows={rows} rowKey="label" addLabel="Add option" emptyText="No answer options." onRowAdd={() => update([...rows, { label: nextChoiceLabel(rows.map(row => row.label)), value: "", correct: false }])} onRowChange={(index, field, value) => { const next = [...rows]; next[index] = { ...next[index], [field]: value }; update(next) }} onRowDelete={index => update(rows.filter((_, rowIndex) => rowIndex !== index))} /> },
  ]
  return <Form fields={fields} values={{ fixed: answer.fixed === true, options: rows }} autoFocus={false} onChange={(name, value) => { if (name === "fixed") onChange({ ...answer, type: "choice", fixed: Boolean(value) }) }} />
}
