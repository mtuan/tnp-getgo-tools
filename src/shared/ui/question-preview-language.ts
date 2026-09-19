import { displayQuestionValue } from "../../features/quiz-editor/domain/question-value-display";

export function localizedPreviewText(
  textEn: unknown,
  textVn: unknown,
  supportedLanguages: Array<"en" | "vi"> = ["en", "vi"],
): { primary: string; secondary?: string } {
  const english = displayQuestionValue(textEn);
  const vietnamese = displayQuestionValue(textVn);
  const hasEnglish = Boolean(english.trim());
  const hasVietnamese = Boolean(vietnamese.trim());
  const showEnglish = supportedLanguages.includes("en");
  const showVietnamese = supportedLanguages.includes("vi");

  if (showEnglish && showVietnamese) {
    if (hasEnglish && hasVietnamese) return { primary: english, secondary: vietnamese };
    return { primary: hasEnglish ? english : vietnamese };
  }
  if (showVietnamese) return { primary: hasVietnamese ? vietnamese : english };
  return { primary: hasEnglish ? english : vietnamese };
}
