import { Form, type FormSchema } from "../ui/Form"
import type { AnswerDetailsProps } from "./types"

const inputTypes = [
  { value: "text", label: "String" },
  { value: "number", label: "Numeric" },
  { value: "date", label: "Date" },
]

export function InputAnswerDetails({ answer, onChange }: AnswerDetailsProps) {
  const inputType = ["text", "number", "date"].includes(String(answer.inputType)) ? String(answer.inputType) : "text"
  const fields: FormSchema[] = [
    { name: "correct", label: "Correct value", type: inputType === "number" ? "number" : inputType === "date" ? "date" : "text" },
    [{ name: "unit", label: "Unit", type: "text" }, { name: "inputType", label: "Input type", type: "select", options: inputTypes }],
  ]
  return <Form fields={fields} values={{ correct: answer.correct, unit: answer.unit, inputType }} autoFocus={false} onChange={(name, value) => onChange({ ...answer, type: "input", choices: undefined, [name]: name === "unit" ? value || undefined : value })} />
}
