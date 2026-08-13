import { useEffect, useRef, useState } from "react"
import { EditTable, type EditColumnDef } from "../../../../shared/ui/EditTable"
import { Form, FormControl, type FormSchema } from "../../../../shared/ui/Form"
import { QuestionAssetInput } from "../../../../shared/ui/QuestionAssetInput"
import type { AnswerDetailsProps } from "./types"

interface ChoiceRow extends Record<string, unknown> { label: string; type: "value" | "image" | "other"; value: unknown; correct: boolean }
const correctKeys = (correct: unknown) => new Set(Array.isArray(correct) ? correct.map(String) : correct == null || correct === "" ? [] : [String(correct)])
const emptyChoiceRows = (): ChoiceRow[] => ["A", "B", "C", "D", "E"].map(label => ({ label, type: "value", value: "", correct: false }))
const withTrailingEmptyChoice = (rows: ChoiceRow[]): ChoiceRow[] => {
  const hasEmptyValue = rows.some(row => row.type === "value" && String(row.value ?? "").trim() === "")
  if (hasEmptyValue) return rows
  const index = rows.length
  return [...rows, {
    label: index < 26 ? String.fromCharCode(65 + index) : `Option ${index + 1}`,
    type: "value",
    value: "",
    correct: false,
  }]
}

const answerSignature = (answer: AnswerDetailsProps["answer"]): string => JSON.stringify({
  choices: answer.choices ?? {},
  correct: answer.correct,
  otherChoiceKey: answer.otherChoiceKey,
})

const rowsFromAnswer = (answer: AnswerDetailsProps["answer"]): ChoiceRow[] => {
  const correct = correctKeys(answer.correct)
  const choices = Object.entries(answer.choices ?? {})
  return choices.length
    ? withTrailingEmptyChoice(choices.map(([label, value]) => ({
        label,
        type: answer.otherChoiceKey === label ? "other" : typeof value === "string" && value.startsWith("asset:") ? "image" : "value",
        value,
        correct: correct.has(label),
      })))
    : emptyChoiceRows()
}

const columns: EditColumnDef<ChoiceRow>[] = [
  { key: "correct", dataKey: "correct", title: "Correct", width: 72, field: { name: "correct", type: "checkbox" } },
  { key: "label", dataKey: "label", title: "Option", width: 72, field: { name: "label", type: "text", readOnly: true }, renderView: value => <strong>{String(value)}</strong> },
  { key: "value", dataKey: "value", title: "Value", field: { name: "value", type: "text" } },
]

export function ChoiceAnswerDetails({ answer, onChange, manifestPath, questionNo }: AnswerDetailsProps) {
  const [rows, setRows] = useState<ChoiceRow[]>(() => rowsFromAnswer(answer))
  const lastEmittedSignature = useRef(answerSignature(answer))
  useEffect(() => {
    const signature = answerSignature(answer)
    if (signature === lastEmittedSignature.current) return
    lastEmittedSignature.current = signature
    setRows(rowsFromAnswer(answer))
  }, [answer])
  const update = (next: ChoiceRow[]) => {
    const visibleRows = withTrailingEmptyChoice(next)
    setRows(visibleRows)
    const populated = visibleRows.filter(row => String(row.value ?? "").trim() !== "")
    const selected = populated.filter(row => row.correct).map(row => row.label)
    const otherChoiceKey = populated.find(row => row.type === "other")?.label
    const nextAnswer = { ...answer, type: "choice", inputs: undefined, choices: Object.fromEntries(populated.map(row => [row.label, row.value])), correct: selected.length > 1 ? selected : selected[0] ?? "" }
    if (otherChoiceKey) nextAnswer.otherChoiceKey = otherChoiceKey
    else delete nextAnswer.otherChoiceKey
    lastEmittedSignature.current = answerSignature(nextAnswer)
    console.info("[GetGo Tools][Choice answer] Answer state updated", {
      visibleRows: visibleRows.map(row => ({ label: row.label, type: row.type, hasValue: String(row.value ?? "").trim() !== "" })),
      savedChoiceKeys: Object.keys(nextAnswer.choices),
      otherChoiceKey,
      correct: nextAnswer.correct,
    })
    onChange(nextAnswer)
  }
  const choiceColumns: EditColumnDef<ChoiceRow>[] = [
    ...columns.slice(0, 2) as EditColumnDef<ChoiceRow>[],
    { key: "type", dataKey: "type", title: "Type", width: 130, field: { name: "type", type: "select", presentation: "dropdown", options: [{ value: "value", label: "Value" }, { value: "image", label: "Image" }, { value: "other", label: "Other" }] } },
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
    { name: "options", type: "custom", render: () => <EditTable<ChoiceRow> ariaLabel="Answer options" columns={choiceColumns} rows={rows} rowKey="label" emptyText="No answer options." onRowChange={(index, field, value) => {
      let next = [...rows]
      if (field === "type") {
        const previous = next[index]
        if (value === "other") next = next.map((row, rowIndex) => rowIndex !== index && row.type === "other" ? { ...row, type: "value" } : row)
        const crossesImageBoundary = previous.type === "image" || value === "image"
        next[index] = { ...previous, type: value, ...(crossesImageBoundary ? { value: "" } : {}) } as ChoiceRow
        console.info("[GetGo Tools][Choice answer] Option type changed", {
          rowIndex: index,
          label: previous.label,
          from: previous.type,
          to: value,
          valuePreserved: !crossesImageBoundary,
          hadValue: String(previous.value ?? "").trim() !== "",
          availableEmptyValueRowsBefore: rows.filter(row => row.type === "value" && String(row.value ?? "").trim() === "").length,
        })
      } else next[index] = { ...next[index], [field]: value } as ChoiceRow
      update(next)
    }} onRowDelete={index => update(rows.filter((_, rowIndex) => rowIndex !== index))} /> },
  ]
  return <Form fields={fields} values={{ fixed: answer.fixed === true, options: rows }} autoFocus={false} onChange={(name, value) => { if (name === "fixed") onChange({ ...answer, type: "choice", fixed: Boolean(value) }) }} />
}
