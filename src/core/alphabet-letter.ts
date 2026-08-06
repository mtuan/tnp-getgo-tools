const vietnameseLetterCharacters: Record<string, string> = {
  A: "aáàảãạ",
  Ă: "ăắằẳẵặ",
  Â: "âấầẩẫậ",
  E: "eéèẻẽẹ",
  Ê: "êếềểễệ",
  I: "iíìỉĩị",
  O: "oóòỏõọ",
  Ô: "ôốồổỗộ",
  Ơ: "ơớờởỡợ",
  U: "uúùủũụ",
  Ư: "ưứừửữự",
  Y: "yýỳỷỹỵ",
};

export function isAlphabetLetterCharacter(
  character: string,
  letter: string,
  language: "English" | "Vietnamese",
): boolean {
  const normalizedCharacter = character.normalize("NFC");
  const normalizedLetter = letter.normalize("NFC");
  if (language === "English") {
    return (
      normalizedCharacter.toLocaleLowerCase("en") ===
      normalizedLetter.toLocaleLowerCase("en")
    );
  }
  const key = normalizedLetter.toLocaleUpperCase("vi");
  const accepted = vietnameseLetterCharacters[key];
  const candidate = normalizedCharacter.toLocaleLowerCase("vi");
  return accepted
    ? accepted.includes(candidate)
    : candidate === normalizedLetter.toLocaleLowerCase("vi");
}

export function alphabetWordContainsLetter(
  word: string,
  letter: string,
  language: "English" | "Vietnamese",
): boolean {
  return Array.from(word).some((character) =>
    isAlphabetLetterCharacter(character, letter, language),
  );
}

export function formatAlphabetWord(
  text: string,
  classifier?: string,
  locale = "vi",
): string {
  const trimmedText = text.trim();
  const trimmedClassifier = classifier?.trim();
  if (!trimmedClassifier) return trimmedText;
  const normalizedText = trimmedText
    .toLocaleLowerCase(locale)
    .replace(/\s+/gu, " ");
  const normalizedClassifier = trimmedClassifier
    .toLocaleLowerCase(locale)
    .replace(/\s+/gu, " ");
  return normalizedText === normalizedClassifier ||
    normalizedText.startsWith(`${normalizedClassifier} `)
    ? trimmedText
    : `${trimmedClassifier} ${trimmedText}`;
}
