import { useEffect, useState, type FormEvent } from "react";
import { Volume2 } from "lucide-react";
import type {
  AppSettings,
  SpeechLanguage,
  SpeechLanguageSettings,
} from "../core/models";
import { speechVoiceDisplayName } from "../core/speech-settings";
import en from "./locales/en.json";
import vi from "./locales/vi.json";
import { DialogFrame } from "./ui/DialogFrame";
import { Form, type FormSchema } from "./ui/Form";
import { Button } from "./ui/Button";
import { Select } from "./ui/Select";
import { logSpokenContent } from "./speech-log";

interface Props {
  language: SpeechLanguage;
  locale: AppSettings["locale"];
  settings: SpeechLanguageSettings;
  voices: SpeechSynthesisVoice[];
  onClose(): void;
  onSave(settings: SpeechLanguageSettings): Promise<void>;
}

export function SpeechSettingsDialog({
  language,
  locale,
  settings,
  voices,
  onClose,
  onSave,
}: Props) {
  const copy = (locale === "vi" ? vi : en).speechSettings;
  const speechCopy = (language === "vi" ? vi : en).speechSettings;
  const [values, setValues] = useState<SpeechLanguageSettings>(() => ({
    ...settings,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => window.speechSynthesis.cancel(), []);
  const languagePrefix = language === "vi" ? "vi" : "en";
  const matchingVoices = voices.filter(
    (voice) =>
      voice.lang.toLocaleLowerCase().startsWith(`${languagePrefix}-`) ||
      voice.voiceURI === values.voiceURI,
  );
  const voiceOptions = [
    { value: "", label: copy.systemVoice },
    ...matchingVoices.map((voice) => ({
      value: voice.voiceURI,
      label: `${voice.name} · ${voice.lang}`,
    })),
  ];

  function playVoiceDemo(voiceURI: string) {
    window.speechSynthesis.cancel();
    const selectedVoice =
      voices.find((voice) => voice.voiceURI === voiceURI) || matchingVoices[0];
    const voiceName = selectedVoice
      ? speechVoiceDisplayName(selectedVoice.name)
      : speechCopy.defaultVoiceName;
    const utterance = new SpeechSynthesisUtterance(
      speechCopy.demoSentence.replace("{name}", voiceName),
    );
    utterance.lang = language === "vi" ? "vi-VN" : "en-US";
    utterance.rate = 1;
    if (selectedVoice) utterance.voice = selectedVoice;
    logSpokenContent(utterance.text, utterance.lang, "voice-demo");
    window.speechSynthesis.speak(utterance);
  }
  const fields: FormSchema[] = [
    {
      name: "voiceURI",
      label: copy.voice,
      helper: matchingVoices.length ? copy.voiceHelp : copy.noVoices,
      type: "custom",
      render: ({ value, disabled, onChange }) => (
        <div className="speech-voice-field">
          <Select
            value={String(value ?? "")}
            options={voiceOptions}
            disabled={disabled}
            ariaLabel={copy.voice}
            onValueChange={(next) => {
              onChange(next);
              playVoiceDemo(next);
            }}
          />
          <Button
            variant="icon"
            color="neutral"
            disabled={disabled}
            aria-label={copy.previewVoice}
            title={copy.previewVoice}
            icon={<Volume2 />}
            onClick={() => playVoiceDemo(String(value ?? ""))}
          />
        </div>
      ),
    },
    [
      {
        name: "letterRate",
        label: copy.letterSpeed,
        type: "number",
        min: 0.25,
        max: 2,
        step: 0.05,
      },
      {
        name: "wordRate",
        label: copy.wordSpeed,
        type: "number",
        min: 0.25,
        max: 2,
        step: 0.05,
      },
    ],
    [
      {
        name: "meaningRate",
        label: copy.meaningSpeed,
        type: "number",
        min: 0.25,
        max: 2,
        step: 0.05,
      },
      {
        name: "pauseMs",
        label: copy.pause,
        helper: copy.pauseHelp,
        type: "number",
        min: 0,
        max: 3000,
        step: 100,
      },
    ],
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(values);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame
      presentation="modal"
      className="speech-settings-dialog"
      title={`${copy.title} · ${language === "vi" ? copy.vietnamese : copy.english}`}
      submitLabel={copy.save}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <Form
        fields={fields}
        values={{ ...values }}
        autoFocus={false}
        onChange={(name, value) =>
          setValues((current) => ({ ...current, [name]: value }))
        }
      />
    </DialogFrame>
  );
}
