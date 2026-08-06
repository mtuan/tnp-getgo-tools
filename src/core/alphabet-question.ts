import type { AlphabetQuestionData, QuizQuestionRecord } from "./models.js";

export const emptyAlphabetData = (): AlphabetQuestionData => ({
  letter: "",
  uppercase: "",
  lowercase: "",
  pronunciation: "",
  samples: [],
});

export function alphabetData(record: QuizQuestionRecord): AlphabetQuestionData {
  if (record.type !== "alphabet" || !record.alphabet)
    return emptyAlphabetData();
  return {
    ...emptyAlphabetData(),
    ...record.alphabet,
    samples: Array.isArray(record.alphabet.samples)
      ? record.alphabet.samples
      : [],
  };
}
