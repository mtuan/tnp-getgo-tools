import { Form, type FormSchema } from "../../../../shared/ui/Form"
import type { AnswerDetailsProps } from "./types"

const inputTypes = [
  { value: "text", label: "String" },
  { value: "number", label: "Numeric" },
  { value: "date", label: "Date" },
]

export function InputAnswerDetails({ answer, onChange }: AnswerDetailsProps) {
  const inputType = ["text", "number", "date"].includes(String(answer.inputType)) ? String(answer.inputType) : "number"
  const fields: FormSchema[] = [
    { name: "correct", label: "Correct value", type: inputType === "number" ? "number" : inputType === "date" ? "date" : "text" },
    [{ name: "unit", label: "Unit", type: "text" }, { name: "inputType", label: "Input type", type: "select", options: inputTypes }],
    { name: "solutionRequired", label: "Detailed solution required", helper: "The student must enter a solution in addition to the final answer.", type: "toggle", presentation: "row" },
  ]
  return <Form fields={fields} values={{ correct: answer.correct, unit: answer.unit, inputType, solutionRequired: answer.solutionRequired === true }} autoFocus={false} onChange={(name, value) => onChange({ ...answer, type: "input", choices: undefined, [name]: name === "unit" ? value || undefined : value })} />
}
