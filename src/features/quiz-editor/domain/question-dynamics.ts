import { QuizTsService } from "@tnp/getgo-logics/authoring"

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
    return !/^\s*\(\s*\{\s*\}\s*\)\s*$/.test(signature)
  } catch {
    return false
  }
}
