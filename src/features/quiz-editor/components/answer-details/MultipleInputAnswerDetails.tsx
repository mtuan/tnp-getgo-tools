import { EditTable, type EditColumnDef } from "../../../../shared/ui/EditTable"
import { Form, FormControl } from "../../../../shared/ui/Form"
import type { AnswerDetailsProps } from "./types"

interface InputRow extends Record<string, unknown> {
  question_en: string
  question_vn: string
  type: "input" | "multiple_answer"
  correct: string | string[]
  inputType: "text" | "number" | "date"
  orderRequired: boolean
  unit: string
}

const answerTypes = [
  { value: "input", label: "Input" },
  { value: "multiple_answer", label: "Multiple answers" },
]

const inputTypes = [
  { value: "number", label: "Numeric" },
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
]

export function MultipleInputAnswerDetails({ answer, onChange, supportedLanguages = ["en", "vi"] }: AnswerDetailsProps) {
  const showEnglish = supportedLanguages.includes("en")
  const showVietnamese = supportedLanguages.includes("vi")
  const columns: EditColumnDef<InputRow>[] = [{
    key: "text",
    dataKey: showEnglish ? "question_en" : "question_vn",
    title: "Text",
    field: { name: showEnglish ? "question_en" : "question_vn", type: "text" },
    renderEdit: ({ row, onChange }) => (
      <div className="multiple-input-text-cell">
        {showEnglish && <FormControl
          field={{ name: "question_en", type: "text", placeholder: "English", required: true }}
          values={row}
          onChange={(_name, value) => onChange("question_en", value)}
        />}
        {showVietnamese && <FormControl
          field={{ name: "question_vn", type: "text", placeholder: "Vietnamese", required: !showEnglish }}
          values={row}
          onChange={(_name, value) => onChange("question_vn", value)}
        />}
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
          field={{ name: "type", type: "select", options: answerTypes, presentation: "dropdown" }}
          values={row}
          onChange={(_name, value) => onChange("type", value)}
        />
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
  {
    key: "answer",
    dataKey: "correct",
    title: "Answer",
    width: 260,
    field: { name: "correct", type: "text", required: true },
    renderEdit: ({ row, onChange }) => row.type === "multiple_answer"
      ? <FormControl
          field={{ name: "correct", type: "multi-tag", placeholder: "Add a value…", helper: "Press Enter or use semicolons to add multiple values." }}
          values={row}
          onChange={(_name, value) => onChange("correct", value)}
        />
      : <FormControl
          field={{ name: "correct", type: "text", required: true }}
          values={row}
          onChange={(_name, value) => onChange("correct", value)}
        />,
  },
  ]
  const correct = Array.isArray(answer.correct) ? answer.correct.map(String) : []
  const rows: InputRow[] = (answer.inputs ?? []).map((part, index) => {
    const multiple = part.type === "multiple_answer" || Array.isArray(part.correct)
    const partCorrect = part.correct ?? correct[index] ?? ""
    return {
      question_en: part.question_en || "",
      question_vn: part.question_vn || "",
      type: multiple ? "multiple_answer" : "input",
      correct: multiple
        ? (Array.isArray(partCorrect) ? partCorrect : [partCorrect]).map(String).filter(Boolean)
        : String(partCorrect),
      inputType: part.inputType ?? "number",
      orderRequired: part.orderRequired === true,
      unit: part.unit ?? "",
    }
  })
  while (rows.length < 2) {
    rows.push({ question_en: "", question_vn: "", type: "input", correct: "", inputType: "number", orderRequired: false, unit: "" })
  }
  const commit = (nextRows: InputRow[]) => onChange({
    ...answer,
    type: "multiple_input",
    choices: undefined,
    correct: nextRows.map(row => Array.isArray(row.correct) ? JSON.stringify(row.correct) : row.correct),
    inputs: nextRows.map(row => ({
      question_en: row.question_en,
      ...(row.question_vn ? { question_vn: row.question_vn } : {}),
      ...(row.type === "multiple_answer" ? { type: "multiple_answer" as const } : {}),
      correct: row.correct,
      inputType: row.inputType,
      ...(row.type === "multiple_answer" && row.orderRequired ? { orderRequired: true } : {}),
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
        onRowChange={(index, field, value) => commit(rows.map((row, rowIndex) => {
          if (rowIndex !== index) return row
          if (field === "type") {
            const type = value === "multiple_answer" ? "multiple_answer" : "input"
            return {
              ...row,
              type,
              correct: type === "multiple_answer"
                ? (Array.isArray(row.correct) ? row.correct : row.correct ? [row.correct] : [])
                : (Array.isArray(row.correct) ? row.correct[0] ?? "" : row.correct),
            }
          }
          return { ...row, [field]: field === "correct" && Array.isArray(value) ? value.map(String) : String(value) }
        }))}
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
