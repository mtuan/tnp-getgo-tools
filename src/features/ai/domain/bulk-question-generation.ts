import type { QuizQuestionRecord } from "../../../shared/domain/models.js";
import { questionContainsImages } from "../../quiz-editor/domain/question-images.js";
import { questionIsVerified } from "../../quiz-editor/domain/question-status.js";
import { questionHasDynamicParams } from "../../quiz-editor/domain/question-dynamics.js";

export const codexQuestionGenerator = "getgo-convert-static-quiz@1";
export const codexQuestionGeneratorMarker = `// @generated-by ${codexQuestionGenerator}`;

export function hasCurrentCodexSkillMarker(source?: string): boolean {
  return source?.includes(codexQuestionGeneratorMarker) === true;
}

export function wasGeneratedByCurrentCodexSkill(question: QuizQuestionRecord): boolean {
  return question.aiResponse?.model === "codex-cli"
    || hasCurrentCodexSkillMarker(question.advancedDynamic?.paramsGeneratorTs);
}

export function isBulkCodexQuestionCandidate(question: QuizQuestionRecord): boolean {
  if (questionIsVerified(question) || question.authoringMode === "reference") return false;
  if (wasGeneratedByCurrentCodexSkill(question)) return false;
  if (questionHasDynamicParams(question.advancedDynamic)) return true;
  return !questionContainsImages(question);
}
