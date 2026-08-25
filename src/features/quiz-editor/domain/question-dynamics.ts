import { composeQuizSharedEditorTypeContext, QuizTsService } from "@tnp/getgo-logics/authoring"
import type { QuizQuestionRecord } from "../../../shared/domain/models.js"

/** Every dynamic question exposes a valid editable explanation callback. */
export const DEFAULT_EXPLANATION_GENERATOR_TS = `({}) => {
  return { en: "", vi: "" }
}`

/** Format an editable callback/expression without Prettier's ASI guard prefix. */
export async function formatDynamicCodeExpression(value: string): Promise<string> {
  return (await QuizTsService.formatSnippet(value)).replace(/^;\s*/, "")
}

/** Browser-safe formatting for every persisted dynamic question code field. */
export async function formatQuestionCode(
  question: QuizQuestionRecord,
): Promise<QuizQuestionRecord> {
  if (!question.advancedDynamic) return question
  const formatField = async (
    value: string | undefined,
    objectExpression = false,
  ): Promise<string> => {
    if (!value?.trim()) return ""
    try {
      const callbackExpression = /^\s*(?:(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|(?:async\s+)?function\b)/.test(value)
      const wrapObjectExpression = objectExpression && !callbackExpression
      const formatted = (await QuizTsService.formatSnippet(
        wrapObjectExpression ? `(${value})` : value,
      )).trim().replace(/^;\s*/, "")
      return wrapObjectExpression
        ? formatted.replace(/^\(\s*/, "").replace(/\s*\)$/, "")
        : formatted
    } catch {
      return value
    }
  }
  const [paramsGeneratorTs, questionGeneratorTs, originParamsTs, explanationGeneratorTs] = await Promise.all([
    formatField(question.advancedDynamic.paramsGeneratorTs),
    formatField(question.advancedDynamic.questionGeneratorTs),
    formatField(question.advancedDynamic.originParamsTs, true),
    formatField(question.advancedDynamic.explanationGeneratorTs),
  ])
  const formattedFields = { paramsGeneratorTs, questionGeneratorTs, originParamsTs, explanationGeneratorTs }
  const draftSource = QuizTsService.composeTemplateSource(formattedFields)
  const formatted = await QuizTsService.formatSnippet(draftSource).catch(() => draftSource)
  return {
    ...question,
    advancedDynamic: {
      ...question.advancedDynamic,
      ...formattedFields,
      draftSourceTs: formatted,
    },
  }
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

export { questionHasDynamicParams } from '@tnp/getgo-logics/authoring'
