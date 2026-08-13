import { alphabetWordStartsWithLetter } from "../../quiz-editor/domain/alphabet-letter.js";

const englishAlphabet = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ");

type DictionaryWords = { enText?: string; viText?: string };

function englishStartingLetter(word: string | undefined) {
  if (!word?.trim()) return null;
  return englishAlphabet.find((letter) =>
    alphabetWordStartsWithLetter(word, letter, "English"),
  ) ?? null;
}

export function dictionaryStartingLetters(rows: DictionaryWords[], locale: string) {
  const letters = new Set<string>();
  for (const row of rows) {
    const englishLetter = englishStartingLetter(row.enText);
    if (englishLetter) letters.add(englishLetter);
  }
  return [...letters].sort(new Intl.Collator(locale, { sensitivity: "base" }).compare);
}

export function dictionaryWordsStartWith(row: DictionaryWords, letter: string) {
  return !letter ||
    Boolean(row.enText && alphabetWordStartsWithLetter(row.enText, letter, "English"));
}
