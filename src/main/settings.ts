import { promises as fs } from "node:fs"
import path from "node:path"
import type { AppSettings } from "../core/models.js"

const defaults: AppSettings = { repositoryPath: null, environment: "staging", aiProfile: "thorough", locale: "en" }

export class SettingsStore {
  constructor(private readonly userDataPath: string) {}
  private get filePath(): string { return path.join(this.userDataPath, "settings.json") }

  async read(): Promise<AppSettings> {
    try {
      const value = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Partial<AppSettings>
      return { ...defaults, ...value }
    } catch { return { ...defaults } }
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const settings = { ...(await this.read()), ...patch }
    await fs.mkdir(this.userDataPath, { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(settings, null, 2), "utf8")
    return settings
  }
}
