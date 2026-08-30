import { createContentSafetyEditor, defaultContentSafetyDictionary, normalizeContentSafetyText } from "@tnp/getgo-logics/domain";

export type SafeWordLanguage = "en" | "vi";

export interface SafeWordDictionary {
  schemaVersion: 2;
  words: Record<SafeWordLanguage, string[]>;
  allowedPhrases: Record<SafeWordLanguage, string[]>;
}

export interface UnsafeContentFinding {
  language: SafeWordLanguage;
  term: string;
  path: string;
  excerpt: string;
}

export const defaultSafeWordDictionary: SafeWordDictionary = {
  schemaVersion: 2,
  words: {
    en: [...defaultContentSafetyDictionary.words.en],
    vi: [...defaultContentSafetyDictionary.words.vi],
  },
  allowedPhrases: {
    en: [...(defaultContentSafetyDictionary.allowedPhrases?.en ?? [])],
    vi: [...(defaultContentSafetyDictionary.allowedPhrases?.vi ?? [])],
  },
};

export function normalizeSafeWordDictionary(value: unknown): SafeWordDictionary {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const words = record.words && typeof record.words === "object" && !Array.isArray(record.words)
    ? record.words as Record<string, unknown>
    : {};
  const list = (language: SafeWordLanguage) => Array.from(new Set((Array.isArray(words[language]) ? words[language] : [])
    .filter((item): item is string => typeof item === "string")
    .map(item => normalizeContentSafetyText(item))
    .filter(Boolean))).sort((left, right) => left.localeCompare(right, language));
  const allowedPhrases = record.allowedPhrases && typeof record.allowedPhrases === "object" && !Array.isArray(record.allowedPhrases)
    ? record.allowedPhrases as Record<string, unknown>
    : {};
  const allowedList = (language: SafeWordLanguage) => Array.from(new Set((Array.isArray(allowedPhrases[language]) ? allowedPhrases[language] : [])
    .filter((item): item is string => typeof item === "string")
    .map(item => normalizeContentSafetyText(item))
    .filter(Boolean))).sort((left, right) => left.localeCompare(right, language));
  return { schemaVersion: 2, words: { en: list("en"), vi: list("vi") }, allowedPhrases: { en: allowedList("en"), vi: allowedList("vi") } };
}

export function findUnsafeContent(value: unknown, dictionary: SafeWordDictionary, path = "$", _seen = new WeakSet<object>()): UnsafeContentFinding[] {
  return createContentSafetyEditor({ dictionary }).inspect(value, path)
    .filter((item): item is typeof item & { language: SafeWordLanguage; term: string } => item.kind === "blocked-word" && Boolean(item.language && item.term))
    .map(({ language, term, path: findingPath, excerpt }) => ({ language, term, path: findingPath, excerpt }));
}

export function unsafeContentMessage(label: string, findings: UnsafeContentFinding[]): string {
  const details = findings.slice(0, 8).map(item => `${item.path}: “${item.term}”`).join("; ");
  const remaining = findings.length > 8 ? `; and ${findings.length - 8} more` : "";
  return `${label} contains blocked content: ${details}${remaining}.`;
}
