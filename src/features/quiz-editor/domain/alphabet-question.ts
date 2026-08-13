import type { AlphabetQuestionContent, QuizQuestionRecord } from "../../../shared/domain/models.js";

export const emptyAlphabetData = (): AlphabetQuestionContent => ({
  letter: "",
  uppercase: "",
  lowercase: "",
  pronunciation: "",
  resources: [],
});

export function alphabetData(
  record: QuizQuestionRecord,
): AlphabetQuestionContent {
  if (record.type !== "alphabet") return emptyAlphabetData();
  return {
    ...emptyAlphabetData(),
    letter: record.letter,
    uppercase: record.uppercase,
    lowercase: record.lowercase,
    pronunciation: record.pronunciation,
    resources: Array.isArray(record.resources) ? record.resources : [],
  };
}
