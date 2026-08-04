import type { ComponentType } from "react"
import type { StaticAnswerType } from "../../core/answer-types"
import { ChoiceAnswerDetails } from "./ChoiceAnswerDetails"
import { InputAnswerDetails } from "./InputAnswerDetails"
import type { AnswerDetailsProps } from "./types"

export const answerDetailsComponents: Record<StaticAnswerType, ComponentType<AnswerDetailsProps>> = {
  input: InputAnswerDetails,
  choice: ChoiceAnswerDetails,
}

export type { EditableAnswer } from "./types"
