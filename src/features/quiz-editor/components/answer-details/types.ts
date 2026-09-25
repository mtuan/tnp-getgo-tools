export interface EditableAnswer extends Record<string, unknown> {
  type: string
  correct: unknown
  choices?: Record<string, unknown>
  inputs?: Array<{
    question_en: string
    question_vn?: string
    type?: "input" | "multiple_answer"
    correct?: string | string[]
    inputType?: "text" | "number" | "date"
    orderRequired?: boolean
    unit?: string
  }>
  unit?: string
  inputType?: string
  orderRequired?: boolean
  fixed?: boolean
  otherChoiceKey?: string
}

export interface AnswerDetailsProps {
  answer: EditableAnswer
  onChange(answer: EditableAnswer): void
  manifestPath?: string
  questionNo?: string | number
  supportedLanguages?: Array<"en" | "vi">
}
