import { promises as fs } from "node:fs";
import path from "node:path";
import type { AppSettings } from "../../../shared/domain/models.js";
import { defaultSpeechSettings } from "../../../features/speech/domain/speech-settings.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";

const defaults: AppSettings = {
  repositoryPath: null,
  environment: "development",
  aiProfile: "thorough",
  locale: "en",
  speech: defaultSpeechSettings,
};

export class SettingsStore {
  constructor(
    private readonly userDataPath: string,
    private readonly toolsAppPath: string,
  ) {}
  private get filePath(): string {
    return path.join(this.userDataPath, "settings.json");
  }

  async read(): Promise<AppSettings> {
    try {
      const value = JSON.parse(
        await fs.readFile(this.filePath, "utf8"),
      ) as Partial<AppSettings>;
      return {
        ...defaults,
        ...value,
        speech: {
          en: { ...defaults.speech.en, ...value.speech?.en },
          vi: { ...defaults.speech.vi, ...value.speech?.vi },
        },
      };
    } catch {
      const repositoryPath = await findRelatedRepository(this.toolsAppPath, {
        packageName: "@tnp/getgo-quizzes",
        directoryName: "tnp-getgo-quizzes",
        environmentVariable: "GETGO_QUIZZES_ROOT",
        requiredDirectory: "quizzes",
      });
      return { ...defaults, repositoryPath };
    }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const settings = { ...(await this.read()), ...patch };
    await fs.mkdir(this.userDataPath, { recursive: true });
    await fs.writeFile(
      this.filePath,
      JSON.stringify(settings, null, 2),
      "utf8",
    );
    return settings;
  }
}
