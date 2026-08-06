import type {
  AppSettings,
  SpeechLanguage,
  SpeechLanguageSettings,
} from "./models.js";

export const defaultSpeechSettings: AppSettings["speech"] = {
  en: {
    voiceURI: "",
    letterRate: 0.75,
    wordRate: 0.65,
    meaningRate: 1,
    pauseMs: 500,
  },
  vi: {
    voiceURI: "",
    letterRate: 0.75,
    wordRate: 0.65,
    meaningRate: 1,
    pauseMs: 500,
  },
};

export function speechVoiceDisplayName(name: string): string {
  const original = name.trim();
  const normalized = original
    .replace(/^(?:microsoft|google|apple)\s+/iu, "")
    .replace(
      /\s*[-–—]\s*(?:english|vietnamese|en(?:-[a-z]{2})?|vi(?:-[a-z]{2})?).*$/iu,
      "",
    )
    .replace(/\s*\([^)]*\)\s*$/u, "")
    .replace(/\s+(?:online|enhanced|premium|compact|natural)$/iu, "")
    .trim();
  return normalized.split(/\s+/u)[0] || original.split(/\s+/u)[0] || original;
}

function boundedNumber(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function normalizeSpeechLanguageSettings(
  value: SpeechLanguageSettings,
): SpeechLanguageSettings {
  if (!value || typeof value !== "object") {
    throw new Error("Speech settings are invalid.");
  }
  if (typeof value.voiceURI !== "string") {
    throw new Error("Speech voice is invalid.");
  }
  return {
    voiceURI: value.voiceURI,
    letterRate: boundedNumber(value.letterRate, "Letter speed", 0.25, 2),
    wordRate: boundedNumber(value.wordRate, "Word speed", 0.25, 2),
    meaningRate: boundedNumber(value.meaningRate, "Meaning speed", 0.25, 2),
    pauseMs: boundedNumber(value.pauseMs, "Pause", 0, 3000),
  };
}

export function withSpeechLanguageSettings(
  settings: AppSettings,
  language: SpeechLanguage,
  value: SpeechLanguageSettings,
): AppSettings {
  if (language !== "en" && language !== "vi") {
    throw new Error("Speech language is invalid.");
  }
  return {
    ...settings,
    speech: {
      ...settings.speech,
      [language]: normalizeSpeechLanguageSettings(value),
    },
  };
}
