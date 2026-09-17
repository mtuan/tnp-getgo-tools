import { Form, type FormSchema } from "../../../../shared/ui/Form"
import type { AnswerDetailsProps } from "./types"

const valuesFrom = (value: unknown): string[] => (Array.isArray(value) ? value : [value])
  .map(item => String(item ?? "").trim())
  .filter(Boolean)

export function MultipleAnswerDetails({ answer, onChange }: AnswerDetailsProps) {
  const fields: FormSchema[] = [
    { name: "correct", label: "Correct values", type: "multi-tag", helper: "Press Enter or use semicolons to add multiple values.", placeholder: "Add a value…" },
    [
      { name: "inputType", label: "Data type", type: "select", options: [{ value: "number", label: "Numeric" }, { value: "text", label: "Text" }] },
      { name: "orderRequired", label: "Order", type: "select", options: [{ value: "false", label: "Unordered" }, { value: "true", label: "Ordered" }] },
    ],
  ]
  return <Form
    fields={fields}
    values={{ correct: valuesFrom(answer.correct), inputType: answer.inputType === "text" ? "text" : "number", orderRequired: String(answer.orderRequired === true) }}
    autoFocus={false}
    onChange={(name, value) => onChange({
      ...answer,
      type: "multiple_answer",
      choices: undefined,
      inputs: undefined,
      correct: name === "correct" ? value : valuesFrom(answer.correct),
      inputType: name === "inputType" ? String(value) : answer.inputType === "text" ? "text" : "number",
      orderRequired: name === "orderRequired" ? value === "true" : answer.orderRequired === true,
    })}
  />
}
