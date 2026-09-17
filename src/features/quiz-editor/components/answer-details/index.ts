import type { ComponentType } from "react"
import type { StaticAnswerType } from "../../../../features/quiz-editor/domain/answer-types"
import { ChoiceAnswerDetails } from "./ChoiceAnswerDetails"
import { InputAnswerDetails } from "./InputAnswerDetails"
import { MultipleInputAnswerDetails } from "./MultipleInputAnswerDetails"
import { MultipleAnswerDetails } from "./MultipleAnswerDetails"
import type { AnswerDetailsProps } from "./types"

export const answerDetailsComponents: Record<StaticAnswerType, ComponentType<AnswerDetailsProps>> = {
  input: InputAnswerDetails,
  multiple_input: MultipleInputAnswerDetails,
  multiple_answer: MultipleAnswerDetails,
  choice: ChoiceAnswerDetails,
}

export type { EditableAnswer } from "./types"
