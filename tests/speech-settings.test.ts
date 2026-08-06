import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultSpeechSettings,
  speechVoiceDisplayName,
  withSpeechLanguageSettings,
} from "../src/core/speech-settings.js";

const settings = {
  repositoryPath: null,
  environment: "staging" as const,
  aiProfile: "thorough" as const,
  locale: "en" as const,
  speech: structuredClone(defaultSpeechSettings),
};

test("updates one language without changing the other speech settings", () => {
  const next = withSpeechLanguageSettings(settings, "vi", {
    voiceURI: "voice-vi",
    letterRate: 0.7,
    wordRate: 0.55,
    meaningRate: 0.95,
    pauseMs: 700,
  });
  assert.equal(next.speech.vi.voiceURI, "voice-vi");
  assert.deepEqual(next.speech.en, settings.speech.en);
});

test("extracts a friendly name from system voice labels", () => {
  assert.equal(speechVoiceDisplayName("Linh"), "Linh");
  assert.equal(
    speechVoiceDisplayName("Daniel English United Kingdom"),
    "Daniel",
  );
  assert.equal(
    speechVoiceDisplayName("Microsoft Linh Online (Natural)"),
    "Linh",
  );
  assert.equal(speechVoiceDisplayName("Apple Samantha (Enhanced)"), "Samantha");
});

test("rejects speech values outside supported ranges", () => {
  assert.throws(
    () =>
      withSpeechLanguageSettings(settings, "en", {
        ...settings.speech.en,
        wordRate: 3,
      }),
    /Word speed must be between/,
  );
});
