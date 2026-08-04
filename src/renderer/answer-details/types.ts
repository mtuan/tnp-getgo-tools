export interface EditableAnswer extends Record<string, unknown> {
  type: string
  correct: unknown
  choices?: Record<string, unknown>
  unit?: string
  inputType?: string
  fixed?: boolean
}

export interface AnswerDetailsProps {
  answer: EditableAnswer
  onChange(answer: EditableAnswer): void
}
