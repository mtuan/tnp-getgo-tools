export type StaticAnswerType = "input" | "multiple_input" | "multiple_answer" | "choice"

export interface AnswerTypeDefinition {
  id: StaticAnswerType
  label: string
}

/** Central extension point for the Static question answer editor. */
export const answerTypeDefinitions: readonly AnswerTypeDefinition[] = [
  { id: "input", label: "Input" },
  { id: "multiple_input", label: "Nested questions" },
  { id: "multiple_answer", label: "Multiple answers" },
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
  multiple_answer: "multiple_answer",
} as const satisfies Record<string, StaticAnswerType>;

export function staticAnswerType(type: unknown, hasChoices = false): StaticAnswerType {
  const id = String(type ?? "")
  if (id in answerTypePresentations)
    return answerTypePresentations[id as keyof typeof answerTypePresentations];
  return hasChoices ? "choice" : "input"
}
