export interface EditableAnswer extends Record<string, unknown> {
  type: string
  correct: unknown
  choices?: Record<string, unknown>
  inputs?: Array<{
    question_en: string
    question_vn?: string
    inputType?: "text" | "number" | "date"
    unit?: string
  }>
  unit?: string
  inputType?: string
  fixed?: boolean
}

export interface AnswerDetailsProps {
  answer: EditableAnswer
  onChange(answer: EditableAnswer): void
}
