import { promises as fs } from "node:fs";
import path from "node:path";
import type { AlphabetDictionary, AlphabetSample } from "../core/models.js";

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
    ...(word.classifier ? { classifier: word.classifier } : {}),
    ...(word.meaning ? { meaning: word.meaning } : {}),
    ...(word.image ? { image: word.image } : {}),
    minimumAge: word.minimumAge as number,
  };
}

export async function loadAlphabetDictionary(
  manifestPath: string,
): Promise<AlphabetDictionary> {
  const filePath = path.join(path.dirname(manifestPath), "dict.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { schemaVersion: 1, words: [] };
    }
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("dict.json must contain an object.");
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
