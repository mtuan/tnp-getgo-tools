import type { AlphabetQuestionContent, QuizQuestionRecord } from "./models.js";

export const emptyAlphabetData = (): AlphabetQuestionContent => ({
  letter: "",
  uppercase: "",
  lowercase: "",
  pronunciation: "",
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
  };
}
