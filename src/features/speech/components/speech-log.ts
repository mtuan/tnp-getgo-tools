export type SpeechContentKind = "letter" | "word" | "meaning" | "voice-demo";

export function logSpokenContent(
  text: string,
  language: string,
  kind: SpeechContentKind,
) {
  console.info("[GetGoToolsSpeech] Speaking", { text, language, kind });
}
