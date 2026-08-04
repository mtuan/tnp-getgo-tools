export type StaticAnswerType = "input" | "choice"

export interface AnswerTypeDefinition {
  id: StaticAnswerType
  label: string
}

/** Central extension point for the Static question answer editor. */
export const answerTypeDefinitions: readonly AnswerTypeDefinition[] = [
  { id: "input", label: "Input" },
  { id: "choice", label: "Choice" },
] as const

const choiceAliases = new Set(["choice", "text_choice", "multiple_choice", "image_choice"])

export function staticAnswerType(type: unknown, hasChoices = false): StaticAnswerType {
  const id = String(type ?? "")
  if (choiceAliases.has(id)) return "choice"
  if (["input", "numeric", "text"].includes(id)) return "input"
  return hasChoices ? "choice" : "input"
}
