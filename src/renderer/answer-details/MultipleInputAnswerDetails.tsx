import { EditTable, type EditColumnDef } from "../ui/EditTable"
import { Form, FormControl } from "../ui/Form"
import type { AnswerDetailsProps } from "./types"

interface InputRow extends Record<string, unknown> {
  question_en: string
  question_vn: string
  correct: string
  inputType: "text" | "number" | "date"
  unit: string
}

const inputTypes = [
  { value: "number", label: "Numeric" },
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
]

const columns: EditColumnDef<InputRow>[] = [
  {
    key: "text",
    dataKey: "question_en",
    title: "Text",
    field: { name: "question_en", type: "text" },
    renderEdit: ({ row, onChange }) => (
      <div className="multiple-input-text-cell">
        <FormControl
          field={{ name: "question_en", type: "text", placeholder: "English", required: true }}
          values={row}
          onChange={(_name, value) => onChange("question_en", value)}
        />
        <FormControl
          field={{ name: "question_vn", type: "text", placeholder: "Vietnamese" }}
          values={row}
          onChange={(_name, value) => onChange("question_vn", value)}
        />
      </div>
    ),
  },
  {
    key: "type-unit",
    dataKey: "inputType",
    title: "Type / unit",
    width: 180,
    field: { name: "inputType", type: "select", options: inputTypes, presentation: "dropdown" },
    renderEdit: ({ row, onChange }) => (
      <div className="multiple-input-type-unit-cell">
        <FormControl
          field={{ name: "inputType", type: "select", options: inputTypes, presentation: "dropdown" }}
          values={row}
          onChange={(_name, value) => onChange("inputType", value)}
        />
        <FormControl
          field={{ name: "unit", type: "text", placeholder: "Unit" }}
          values={row}
          onChange={(_name, value) => onChange("unit", value)}
        />
      </div>
    ),
  },
  { key: "answer", dataKey: "correct", title: "Answer", width: 180, field: { name: "correct", type: "text", required: true } },
]

export function MultipleInputAnswerDetails({ answer, onChange }: AnswerDetailsProps) {
  const correct = Array.isArray(answer.correct) ? answer.correct.map(String) : []
  const rows: InputRow[] = (answer.inputs ?? []).map((part, index) => ({
    question_en: part.question_en || "",
    question_vn: part.question_vn || "",
    correct: correct[index] ?? "",
    inputType: part.inputType ?? "number",
    unit: part.unit ?? "",
  }))
  while (rows.length < 2) {
    rows.push({ question_en: "", question_vn: "", correct: "", inputType: "number", unit: "" })
  }
  const commit = (nextRows: InputRow[]) => onChange({
    ...answer,
    type: "multiple_input",
    choices: undefined,
    correct: nextRows.map(row => row.correct),
    inputs: nextRows.map(row => ({
      question_en: row.question_en,
      ...(row.question_vn ? { question_vn: row.question_vn } : {}),
      inputType: row.inputType,
      ...(row.unit ? { unit: row.unit } : {}),
    })),
  })
  return <Form
    fields={[{
      name: "inputs",
      label: "Inputs",
      type: "custom",
      render: () => <EditTable<InputRow>
        ariaLabel="Multiple input answers"
        columns={columns}
        rows={rows}
        reorderable
        onRowsReorder={commit}
        onRowChange={(index, field, value) => commit(rows.map((row, rowIndex) =>
          rowIndex === index ? { ...row, [field]: String(value) } : row))}
        {...(rows.length > 2
          ? { onRowDelete: (index: number) => commit(rows.filter((_, rowIndex) => rowIndex !== index)) }
          : {})}
      />,
    }]}
    values={{ inputs: rows }}
    autoFocus={false}
    onChange={() => undefined}
  />
}
