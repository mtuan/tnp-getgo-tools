import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AlphabetDictionary,
  AlphabetSample,
  KidLearningDictionary,
} from "../../../shared/domain/models.js";

function alphabetWord(value: unknown, index: number): AlphabetSample {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Dictionary word ${index + 1} must be an object.`);
  }
  const word = value as Record<string, unknown>;
  if (typeof word.text !== "string" || !word.text.trim()) {
    throw new Error(`Dictionary word ${index + 1} requires text.`);
  }
  if (word.classifier !== undefined && typeof word.classifier !== "string") {
    throw new Error(`Dictionary word ${index + 1} classifier is invalid.`);
  }
  if (typeof word.classifier === "string" && word.classifier.trim()) {
    const classifier = word.classifier
      .trim()
      .toLocaleLowerCase("vi")
      .replace(/\s+/gu, " ");
    const text = word.text.trim().toLocaleLowerCase("vi").replace(/\s+/gu, " ");
    if (text === classifier || text.startsWith(`${classifier} `)) {
      throw new Error(
        `Dictionary word ${index + 1} text already contains its classifier.`,
      );
    }
  }
  if (word.meaning !== undefined && typeof word.meaning !== "string") {
    throw new Error(`Dictionary word ${index + 1} meaning is invalid.`);
  }
  if (word.spelling !== undefined && typeof word.spelling !== "string")
    throw new Error(`Dictionary word ${index + 1} spelling is invalid.`);
  if (word.pronunciation !== undefined && typeof word.pronunciation !== "string")
    throw new Error(`Dictionary word ${index + 1} pronunciation is invalid.`);
  if (word.aliases !== undefined && !Array.isArray(word.aliases))
    throw new Error(`Dictionary word ${index + 1} aliases are invalid.`);
  if (
    word.image !== undefined &&
    (typeof word.image !== "string" || !word.image.startsWith("asset:"))
  ) {
    throw new Error(`Dictionary word ${index + 1} image is invalid.`);
  }
  if (
    !Number.isInteger(word.minimumAge) ||
    (word.minimumAge as number) < 3 ||
    (word.minimumAge as number) > 8
  ) {
    throw new Error(
      `Dictionary word ${index + 1} minimumAge must be an integer from 3 through 8.`,
    );
  }
  return {
    text: word.text,
    ...(Array.isArray(word.aliases) ? {
      aliases: word.aliases.map((alias, aliasIndex) => {
        if (!alias || typeof alias !== "object" || Array.isArray(alias) || typeof (alias as Record<string, unknown>).text !== "string")
          throw new Error(`Dictionary word ${index + 1} alias ${aliasIndex + 1} requires text.`);
        const value = alias as Record<string, unknown>;
        return {
          text: String(value.text),
          ...(typeof value.classifier === "string" ? { classifier: value.classifier } : {}),
          ...(typeof value.spelling === "string" ? { spelling: value.spelling } : {}),
          ...(typeof value.pronunciation === "string" ? { pronunciation: value.pronunciation } : {}),
          ...(typeof value.meaning === "string" ? { meaning: value.meaning } : {}),
        };
      }),
    } : {}),
    ...(word.classifier ? { classifier: word.classifier } : {}),
    ...(word.spelling ? { spelling: word.spelling } : {}),
    ...(word.pronunciation ? { pronunciation: word.pronunciation } : {}),
    ...(word.meaning ? { meaning: word.meaning } : {}),
    ...(word.image ? { image: word.image } : {}),
    minimumAge: word.minimumAge as number,
  };
}

export function parseAlphabetDictionary(parsed: unknown): AlphabetDictionary {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Dictionary must contain an object.");
  }
  const dictionary = parsed as Record<string, unknown>;
  if (dictionary.schemaVersion !== 1 || !Array.isArray(dictionary.words)) {
    throw new Error("dict.json must use schemaVersion 1 and contain words.");
  }
  return {
    schemaVersion: 1,
    words: dictionary.words.map(alphabetWord),
  };
}

export function parseKidLearningDictionary(parsed: unknown): KidLearningDictionary {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Shared dictionary must contain an object.");
  const dictionary = parsed as Record<string, unknown>;
  if (dictionary.schemaVersion !== 2 || !Array.isArray(dictionary.entries))
    throw new Error("Shared dictionary must use schemaVersion 2 and contain entries.");
  return {
    schemaVersion: 2,
    entries: dictionary.entries.map((value, index) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`Dictionary entry ${index + 1} must be an object.`);
      const entry = value as Record<string, unknown>;
      if (typeof entry.id !== "string" || !entry.id)
        throw new Error(`Dictionary entry ${index + 1} requires an id.`);
      if (!entry.translations || typeof entry.translations !== "object" || Array.isArray(entry.translations))
        throw new Error(`Dictionary entry ${index + 1} requires translations.`);
      const translations = Object.fromEntries(
        (["en", "vi"] as const).flatMap((language) => {
          const translation = (entry.translations as Record<string, unknown>)[language];
          if (translation === undefined) return [];
          return [[language, alphabetWord({
            ...(translation as Record<string, unknown>),
            image: entry.image,
            minimumAge: entry.minimumAge,
          }, index)]];
        }),
      ) as KidLearningDictionary["entries"][number]["translations"];
      return {
        id: entry.id,
        reviewed: entry.reviewed === true,
        ...(typeof entry.image === "string" ? { image: entry.image } : {}),
        ...(typeof entry.audio === "string" ? { audio: entry.audio } : {}),
        minimumAge: Number(entry.minimumAge),
        translations: Object.fromEntries(Object.entries(translations).map(([language, word]) => [
          language,
          Object.fromEntries(Object.entries(word).filter(([key]) => key !== "image" && key !== "minimumAge")),
        ])),
      } as KidLearningDictionary["entries"][number];
    }),
  };
}

export function localizedAlphabetDictionary(
  dictionary: KidLearningDictionary,
  language: "en" | "vi",
): AlphabetDictionary {
  return {
    schemaVersion: 1,
    words: dictionary.entries.filter((entry) => entry.reviewed === true).flatMap((entry) => {
      const translation = entry.translations[language];
      if (!translation) return [];
      const { aliases = [], ...primary } = translation;
      return [primary, ...aliases].map((word) => ({
        ...word,
        ...(entry.image ? { image: entry.image } : {}),
        minimumAge: entry.minimumAge,
      }));
    }),
  };
}

export function reviewedKidLearningDictionary(
  dictionary: KidLearningDictionary,
): KidLearningDictionary {
  return {
    ...dictionary,
    entries: dictionary.entries.filter((entry) => entry.reviewed === true),
  };
}

export async function loadAlphabetDictionary(
  manifestPath: string,
): Promise<AlphabetDictionary> {
  const filePath = path.join(path.dirname(manifestPath), "dict.json");
  try {
    return parseAlphabetDictionary(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { schemaVersion: 1, words: [] };
    throw error;
  }
}

export async function saveAlphabetDictionary(
  manifestPath: string,
  value: unknown,
): Promise<AlphabetDictionary> {
  const dictionary = parseAlphabetDictionary(value);
  const filePath = path.join(path.dirname(manifestPath), "dict.json");
  await fs.writeFile(filePath, `${JSON.stringify(dictionary, null, 2)}\n`, "utf8");
  return dictionary;
}
