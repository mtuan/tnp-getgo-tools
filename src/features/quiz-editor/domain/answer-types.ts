export type StaticAnswerType = "input" | "multiple_input" | "choice"

export interface AnswerTypeDefinition {
  id: StaticAnswerType
  label: string
}

/** Central extension point for the Static question answer editor. */
export const answerTypeDefinitions: readonly AnswerTypeDefinition[] = [
  { id: "input", label: "Input" },
  { id: "multiple_input", label: "Multiple inputs" },
  { id: "choice", label: "Choice" },
] as const

const answerTypePresentations = {
  choice: "choice",
  text_choice: "choice",
  multiple_choice: "choice",
  image_choice: "choice",
  input: "input",
  numeric: "input",
  text: "input",
  multiple_input: "multiple_input",
} as const satisfies Record<IQuizAnswer["type"], StaticAnswerType>;

export function staticAnswerType(type: unknown, hasChoices = false): StaticAnswerType {
  const id = String(type ?? "")
  if (id in answerTypePresentations)
    return answerTypePresentations[id as IQuizAnswer["type"]];
  return hasChoices ? "choice" : "input"
}
import type { IQuizAnswer } from "@tnp/getgo-logics";
