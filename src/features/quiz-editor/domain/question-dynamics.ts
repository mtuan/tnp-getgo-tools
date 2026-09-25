import { composeQuizSharedEditorTypeContext, QuizTsService } from "@tnp/getgo-logics/authoring"
import type { QuizQuestionRecord } from "../../../shared/domain/models.js"
import { includeOriginalParameterSignatures } from "./generator-signatures.js"

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

function comparableFormattedQuestion(question: QuizQuestionRecord): unknown {
  if (!question.advancedDynamic) return question
  const { draftSourceTs: _derivedDraftSource, ...advancedDynamic } =
    question.advancedDynamic
  return { ...question, advancedDynamic }
}

function withComparableGeneratorSignatures(
  question: QuizQuestionRecord,
): QuizQuestionRecord {
  const dynamic = question.advancedDynamic
  if (!dynamic) return question
  try {
    return {
      ...question,
      advancedDynamic: {
        ...dynamic,
        ...includeOriginalParameterSignatures(dynamic),
      },
    }
  } catch {
    // Invalid drafts must remain persistable and are never assumed equivalent.
    return question
  }
}

/**
 * Return the canonical draft only when formatting is the complete difference
 * between it and the persisted question. Derived template source is ignored in
 * the same way as the editor's dirty-state comparison.
 */
export async function formattedQuestionForCodeOnlyChange(
  persisted: QuizQuestionRecord,
  draft: QuizQuestionRecord,
): Promise<QuizQuestionRecord | null> {
  if (!persisted.advancedDynamic || !draft.advancedDynamic) return null
  const [formattedPersisted, formattedDraft] = await Promise.all([
    formatQuestionCode(persisted),
    formatQuestionCode(draft),
  ])
  return JSON.stringify(comparableFormattedQuestion(
    withComparableGeneratorSignatures(formattedPersisted),
  )) === JSON.stringify(comparableFormattedQuestion(
    withComparableGeneratorSignatures(formattedDraft),
  ))
    ? formattedDraft
    : null
}

/** Keep a following callback expression from chaining onto shared-code IIFEs. */
export function quizSharedEditorContext(value: string): string {
  return composeQuizSharedEditorTypeContext(value)
}

/**
 * Give every Monaco fragment its own hidden QuizBuilder binding. This avoids
 * relying solely on Monaco's worker-global declaration, which can be detached
 * when cached models are replaced or their surrounding signature is rewritten.
 */
export function dynamicEditorModelEnvelope(
  paramsGeneratorTs?: string,
  originParamsTs?: string,
): {
  prefix: string
  suffix: string
} {
  const paramsSource = paramsGeneratorTs?.trim()
  const originSource = originParamsTs?.trim()
  const originGeneratorSource = originSource
    ? /^\s*\(\s*\)\s*=>/.test(originSource)
      ? originSource
      : `() => (${originSource})`
    : ""
  const paramsTypeContext = paramsSource
    ? `const __getgoParamsGeneratorForEditor = (${paramsSource});
${originGeneratorSource ? `const __getgoOriginParamsForEditor = (${originGeneratorSource});
type __GetGoMergeParams<Generated, Original> = {
  [Key in keyof Generated]:
    Key extends keyof Original ? Generated[Key] | Original[Key] : Generated[Key];
} & {
  [Key in Exclude<keyof Original, keyof Generated>]?: Original[Key];
};
type __GetGoParams = __GetGoMergeParams<
  ReturnType<typeof __getgoParamsGeneratorForEditor>,
  ReturnType<typeof __getgoOriginParamsForEditor>
>;
` : `type __GetGoParams = ReturnType<typeof __getgoParamsGeneratorForEditor>;
`}`
    : ""
  return {
    prefix: `(() => {
/* __GETGO_EDITOR_ENVELOPE_START__ */
const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;
${paramsTypeContext}return (`,
    suffix: `
);
/* __GETGO_EDITOR_ENVELOPE_END__ */
})()`,
  }
}

const EDITOR_ENVELOPE_QB_BINDING = 'const QB = null as unknown as import("@tnp/getgo-logics/quiz-builder/QuizBuilder").QuizBuilder;'
const EDITOR_ENVELOPE_SUFFIX = "\n);\n/* __GETGO_EDITOR_ENVELOPE_END__ */\n})()"
const LEGACY_EDITOR_ENVELOPE_SUFFIX = "\n);\n})()"

function innermostEditorCallback(source: string): string | null {
  const bindingIndex = source.lastIndexOf(EDITOR_ENVELOPE_QB_BINDING)
  if (bindingIndex < 0) return null
  const afterBinding = bindingIndex + EDITOR_ENVELOPE_QB_BINDING.length
  const returnMatch = /\n\s*return\s*\(/.exec(source.slice(afterBinding))
  if (!returnMatch) return null
  const valueStart = afterBinding + returnMatch.index + returnMatch[0].length
  const callbackStartOffset = source.slice(valueStart).search(/(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/)
  if (callbackStartOffset < 0) return null
  const callbackStart = valueStart + callbackStartOffset
  const bodyStart = source.indexOf("{", callbackStart)
  let depth = 0
  let quote: "'" | '"' | "`" | null = null
  let escaped = false
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === "\\") escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character
      continue
    }
    if (character === "{") depth += 1
    if (character !== "}") continue
    depth -= 1
    if (depth === 0) return source.slice(callbackStart, index + 1).trim()
  }
  return null
}

/** A repaired prop must replace a cached model even if Monaco marked it local. */
export function editorModelHasExtraEnvelopes(current: string, expected: string): boolean {
  const occurrences = (source: string) => source.split(EDITOR_ENVELOPE_QB_BINDING).length - 1
  return occurrences(current) > occurrences(expected)
}

/**
 * Remove Monaco-only type envelopes before code reaches the persisted draft.
 * Repeating the operation deliberately repairs values leaked by older cached
 * editor models without mistaking an ordinary user-authored IIFE for context.
 */
export function dynamicEditorValueFromModel(
  value: string,
  expectedPrefix = "",
  expectedSuffix = "",
): string {
  let source = value
  let removedEnvelope = false
  for (let depth = 0; depth < 8; depth += 1) {
    if (
      expectedPrefix
      && expectedSuffix
      && source.startsWith(expectedPrefix)
      && source.endsWith(expectedSuffix)
    ) {
      source = source.slice(expectedPrefix.length, -expectedSuffix.length)
      removedEnvelope = true
      continue
    }

    const recoveredCallback = innermostEditorCallback(source)
    if (recoveredCallback) {
      source = recoveredCallback
      removedEnvelope = true
      continue
    }

    const trimmed = source.trim()
    const hasCurrentMarker = trimmed.startsWith("(() => {\n/* __GETGO_EDITOR_ENVELOPE_START__ */")
    const hasLegacyMarker = trimmed.startsWith(`(() => {\n${EDITOR_ENVELOPE_QB_BINDING}`)
    if (!hasCurrentMarker && !hasLegacyMarker) break
    const suffix = hasCurrentMarker
      ? EDITOR_ENVELOPE_SUFFIX
      : LEGACY_EDITOR_ENVELOPE_SUFFIX
    if (!trimmed.endsWith(suffix)) break
    // Recover from the innermost leaked envelope first. A stale Monaco model
    // can place it inside an earlier callback wrapper that is no longer valid.
    const bindingIndex = trimmed.lastIndexOf(EDITOR_ENVELOPE_QB_BINDING)
    const afterBinding = bindingIndex + EDITOR_ENVELOPE_QB_BINDING.length
    const returnMatch = /\n\s*return\s*\(/.exec(trimmed.slice(afterBinding))
    if (!returnMatch) break
    const valueStart = afterBinding + returnMatch.index + returnMatch[0].length
    source = trimmed.slice(valueStart, -suffix.length)
    removedEnvelope = true
  }
  if (removedEnvelope) {
    // Older leaked envelopes can contain one orphaned wrapper brace after the
    // callback. Remove only standalone trailing braces that make the complete
    // recovered value structurally over-closed.
    while (
      source.trimEnd().endsWith("\n}")
      && (source.match(/}/g)?.length ?? 0) > (source.match(/{/g)?.length ?? 0)
    ) source = source.trimEnd().slice(0, -1).trimEnd()
    // A partially persisted envelope can leave its `return (` closer directly
    // before the recovered callback's final brace. Remove that delimiter only
    // when closing parentheses outnumber opening parentheses.
    while (
      (source.match(/\)/g)?.length ?? 0) > (source.match(/\(/g)?.length ?? 0)
      && /\n\s*\)\s*\n\s*}\s*$/.test(source)
    ) source = source.replace(/\n\s*\)\s*(\n\s*}\s*)$/, "$1")
  }
  return removedEnvelope ? source.trim() : source
}

/** Present persisted origin data as a consistent, lockable callback field. */
export function originParamsEditorSource(value: string): string {
  const source = dynamicEditorValueFromModel(value).trim() || "{}"
  if (/^\s*\(\s*\)\s*=>/.test(source)) return source
  const indentedSource = source
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")
  return `() => {\n  return ${indentedSource.trimStart()}\n}`
}

/** Remove only the visible, locked origin callback wrapper before persistence. */
export function originParamsValueFromEditor(value: string): string {
  const recovered = dynamicEditorValueFromModel(value)
  const match = /^\s*\(\s*\)\s*=>\s*\{\s*return\s+([\s\S]*?)\s*;?\s*\}\s*$/.exec(recovered)
  if (!match) return recovered.trim()
  return match[1]
    .trim()
    .split("\n")
    .map((line, index) => index === 0 ? line : line.replace(/^ {2}/, ""))
    .join("\n")
}

export { questionHasDynamicParams } from '@tnp/getgo-logics/authoring'
