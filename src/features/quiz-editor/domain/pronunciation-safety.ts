export interface PronunciationSafetyCell {
  text: string;
  speech?: string;
  audio?: string;
}

export interface PronunciationSafetyQuestion {
  type: string;
  sounds?: Array<{
    sound: PronunciationSafetyCell;
    forms: PronunciationSafetyCell[];
  }>;
}

// These are whole generated syllables, not substring matches. Keeping this
// list at the data boundary prevents unsafe text from leaking through preview,
// speech, publishing, exports, or future clients.
const UNSAFE_VIETNAMESE_PRONUNCIATION_FORMS = new Set([
  "buồi",
  "cặc",
  "cu",
  "đéo",
  "đĩ",
  "địt",
  "đụ",
  "lồn",
  "ngu",
  "phò",
  "vú",
]);

function normalizedForm(value: string): string {
  return value.normalize("NFC").trim().toLocaleLowerCase("vi");
}

export function isSafeVietnamesePronunciationForm(value: string): boolean {
  return !UNSAFE_VIETNAMESE_PRONUNCIATION_FORMS.has(normalizedForm(value));
}

export function sanitizeVietnamesePronunciationQuestion<T extends PronunciationSafetyQuestion>(record: T): T {
  if (record.type !== "pronunciation-sound" || !Array.isArray(record.sounds)) return record;
  return {
    ...record,
    sounds: record.sounds.map(item => ({
      ...item,
      forms: item.forms.map(form => isSafeVietnamesePronunciationForm(form.text)
        ? form
        : { text: "" }),
    })),
  } as T;
}
