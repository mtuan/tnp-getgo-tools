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
  otherChoiceKey?: string
}

export interface AnswerDetailsProps {
  answer: EditableAnswer
  onChange(answer: EditableAnswer): void
  manifestPath?: string
  questionNo?: string | number
}
