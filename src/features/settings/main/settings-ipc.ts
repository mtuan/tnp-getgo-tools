import type { IpcMain } from "electron";
import type { AppSettings, SpeechLanguage, SpeechLanguageSettings } from "../../../shared/domain/models.js";
import { withSpeechLanguageSettings } from "../../speech/domain/speech-settings.js";
import type { AiMigrationJobManager } from "../../ai/main/ai-migration-jobs.js";
import type { LocalAiService } from "../../ai/main/local-ai.js";
import type { SettingsStore } from "./settings.js";

export function registerSettingsIpc(
  ipc: IpcMain,
  settings: SettingsStore,
  localAi: LocalAiService,
  aiMigrationJobs: AiMigrationJobManager,
): void {
  ipc.handle(
    "settings:environment",
    (_event, environment: AppSettings["environment"]) => {
      if (!["development", "staging", "production"].includes(environment))
        throw new Error("Invalid environment");
      return settings.update({ environment });
    },
  );
  ipc.handle(
    "settings:ai-profile",
    async (_event, profile: AppSettings["aiProfile"]) => {
      if (!["thorough", "fast"].includes(profile))
        throw new Error("Invalid AI profile");
      const next = await settings.update({ aiProfile: profile });
      localAi.setProfile(profile);
      aiMigrationJobs.setProfile(profile);
      return next;
    },
  );
  ipc.handle("settings:locale", (_event, locale: AppSettings["locale"]) => {
    if (!["en", "vi"].includes(locale)) throw new Error("Invalid locale");
    return settings.update({ locale });
  });
  ipc.handle(
    "settings:speech",
    async (_event, language: SpeechLanguage, value: SpeechLanguageSettings) => {
      const current = await settings.read();
      const next = withSpeechLanguageSettings(current, language, value);
      return settings.update({ speech: next.speech });
    },
  );
}
