import { composeQuizSharedEditorTypeContext, QuizTsService } from "@tnp/getgo-logics/authoring"

/** Every dynamic question exposes a valid editable explanation callback. */
export const DEFAULT_EXPLANATION_GENERATOR_TS = `({}) => {
  return { en: "", vi: "" }
}`

/** Format an editable callback/expression without Prettier's ASI guard prefix. */
export async function formatDynamicCodeExpression(value: string): Promise<string> {
  return (await QuizTsService.formatSnippet(value)).replace(/^;\s*/, "")
}

/** Keep a following callback expression from chaining onto shared-code IIFEs. */
export function quizSharedEditorContext(value: string): string {
  return composeQuizSharedEditorTypeContext(value)
}

/** Present persisted origin data as a consistent, lockable callback field. */
export function originParamsEditorSource(value: string): string {
  const source = value.trim() || "{}"
  const indentedSource = source
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
  return `() => {\n  return ${indentedSource.trimStart()}\n}`
}

/** Remove only the visible, locked origin callback wrapper before persistence. */
export function originParamsValueFromEditor(value: string): string {
  const match = /^\s*\(\s*\)\s*=>\s*\{\s*return\s+([\s\S]*?)\s*;?\s*\}\s*$/.exec(value)
  if (!match) return value.trim()
  return match[1]
    .trim()
    .split("\n")
    .map((line, index) => index === 0 ? line : line.replace(/^ {2}/, ""))
    .join("\n")
}

interface DynamicQuestionFields {
  paramsGeneratorTs?: string
}

/** A question is dynamic only when its parameter generator returns named values. */
export function questionHasDynamicParams(advanced?: DynamicQuestionFields): boolean {
  if (!advanced?.paramsGeneratorTs?.trim()) return false
  try {
    const probe = QuizTsService.composeTemplateSource({
      paramsGeneratorTs: advanced.paramsGeneratorTs,
      questionGeneratorTs: "({ __getgoProbe }) => ({ question_no: 0, text_en: '', answer: QB.answer.input('') })",
      explanationGeneratorTs: "({ __getgoProbe }) => ({ en: '', vi: '' })",
      originParamsTs: "{}",
    })
    const synchronized = QuizTsService.syncQuestionGeneratorSignature(probe)
    const signature = QuizTsService.extractTemplateSourceFields(synchronized).questionGeneratorTs.split("=>", 1)[0]
    return !/^\s*\(\s*\{\s*\}\s*(?::\s*__GetGoParams)?\s*\)\s*$/.test(signature)
  } catch {
    return false
  }
}
