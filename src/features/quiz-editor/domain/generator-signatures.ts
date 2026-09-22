import { QuizTsService } from "@tnp/getgo-logics/authoring";

type DynamicGeneratorFields = {
  paramsGeneratorTs: string;
  questionGeneratorTs: string;
  explanationGeneratorTs: string;
  originParamsTs: string;
};

const PROBE = "({}) => ({ question_no: 1, text_en: '', answer: QB.answer.input('') })";
const EXPLANATION_PROBE = "({}) => ({ en: '', vi: '' })";

function synchronizedNames(paramsGeneratorTs: string): string[] {
  const fields = QuizTsService.extractTemplateSourceFields(
    QuizTsService.syncQuestionGeneratorSignature(
      QuizTsService.composeTemplateSource({
        paramsGeneratorTs,
        questionGeneratorTs: PROBE,
        explanationGeneratorTs: EXPLANATION_PROBE,
        originParamsTs: "{}",
      }),
    ),
  );
  const match = /^\s*\(\{([^}]*)\}\s*:\s*__GetGoParams\)/.exec(
    fields.questionGeneratorTs,
  );
  return match?.[1]
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean) ?? [];
}

function replaceSignature(source: string, names: string[]): string {
  const signature = `({ ${names.join(", ")} }: __GetGoParams)`;
  return source.replace(
    /^\s*\(\{[^}]*\}\s*(?::\s*__GetGoParams)?\)/,
    signature,
  );
}

function originValue(source: string): string {
  const match = /^\s*\(\s*\)\s*=>\s*\{\s*return\s+([\s\S]*?)\s*;?\s*\}\s*$/.exec(source);
  return match?.[1].trim() ?? source.trim();
}

function originGenerator(source: string): string {
  const normalized = originValue(source);
  return /^\s*\(\s*\)\s*=>/.test(normalized)
    ? normalized
    : `() => (${normalized})`;
}

/** Compatibility layer until Tools consumes the next Logics package archive. */
export function includeOriginalParameterSignatures(
  fields: DynamicGeneratorFields,
): Pick<DynamicGeneratorFields, "questionGeneratorTs" | "explanationGeneratorTs"> {
  const generatedNames = synchronizedNames(fields.paramsGeneratorTs);
  const originalNames = synchronizedNames(originGenerator(fields.originParamsTs));
  const names = [...generatedNames, ...originalNames]
    .filter((name, index, all) => all.indexOf(name) === index);
  return {
    questionGeneratorTs: replaceSignature(fields.questionGeneratorTs, names),
    explanationGeneratorTs: replaceSignature(fields.explanationGeneratorTs, names),
  };
}
