import { ChevronDown, ChevronUp, Trash2 } from "lucide-react"
import { Button } from "../ui/Button"
import { Form, type FormSchema } from "../ui/Form"
import type { AnswerDetailsProps } from "./types"

interface InputRow extends Record<string, unknown> {
  question_en: string
  question_vn: string
  correct: string
  inputType: "text" | "number" | "date"
  unit: string
}

const inputTypes = [
  { value: "text", label: "String" },
  { value: "number", label: "Numeric" },
  { value: "date", label: "Date" },
]

const fields: FormSchema[] = [
  [
    { name: "inputType", label: "Input type", type: "select", options: inputTypes, presentation: "dropdown" },
    { name: "unit", label: "Unit", type: "text" },
  ],
  { name: "question_en", label: "English question part", type: "text", required: true },
  { name: "question_vn", label: "Vietnamese question part", type: "text" },
  { name: "correct", label: "Correct answer", type: "text", required: true },
]

export function MultipleInputAnswerDetails({ answer, onChange }: AnswerDetailsProps) {
  const correct = Array.isArray(answer.correct) ? answer.correct.map(String) : []
  const rows: InputRow[] = (answer.inputs ?? []).map((part, index) => ({
    question_en: part.question_en || "",
    question_vn: part.question_vn || "",
    correct: correct[index] ?? "",
    inputType: part.inputType ?? "text",
    unit: part.unit ?? "",
  }))
  while (rows.length < 2) {
    rows.push({ question_en: "", question_vn: "", correct: "", inputType: "text", unit: "" })
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
  const move = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= rows.length) return
    const reordered = [...rows]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    commit(reordered)
  }

  return <div className="multiple-input-forms">
    {rows.map((row, index) => (
      <section className="multiple-input-form" key={index}>
        <header>
          <strong>Input {index + 1}</strong>
          <span>
            <Button variant="icon" disabled={index === 0} title="Move input up" aria-label={`Move input ${index + 1} up`} icon={<ChevronUp size={16} />} onClick={() => move(index, -1)} />
            <Button variant="icon" disabled={index === rows.length - 1} title="Move input down" aria-label={`Move input ${index + 1} down`} icon={<ChevronDown size={16} />} onClick={() => move(index, 1)} />
            <Button variant="icon" color="danger" disabled={rows.length <= 2} title="Delete input" aria-label={`Delete input ${index + 1}`} icon={<Trash2 size={16} />} onClick={() => commit(rows.filter((_, rowIndex) => rowIndex !== index))} />
          </span>
        </header>
        <Form
          fields={fields}
          values={row}
          autoFocus={false}
          autoSelectSingleOption={false}
          onChange={(name, value) => commit(rows.map((item, rowIndex) => rowIndex === index ? { ...item, [name]: String(value) } : item))}
        />
      </section>
    ))}
  </div>
}
