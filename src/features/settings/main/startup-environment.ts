import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { StartupEnvironmentCheck, StartupEnvironmentReadiness } from "../domain/startup-environment.js";
import { findRelatedRepository } from "../../../shared/main/repository-locator.js";

const execFileAsync = promisify(execFile);

interface RepositoryCheck {
  id: string;
  label: string;
  packageName: string;
  directoryName: string;
  environmentVariable: string;
  requiredDirectory?: string;
  required: boolean;
}

const repositories: RepositoryCheck[] = [
  { id: "quizzes", label: "Quiz content", packageName: "@tnp/getgo-quizzes", directoryName: "tnp-getgo-quizzes", environmentVariable: "GETGO_QUIZZES_ROOT", requiredDirectory: "quizzes", required: true },
  { id: "web", label: "GetGo Web", packageName: "tnp-getgo-web", directoryName: "tnp-getgo-web", environmentVariable: "GETGO_WEB_ROOT", required: true },
  { id: "app", label: "GetGo App", packageName: "tnp-getgo", directoryName: "tnp-getgo-app", environmentVariable: "GETGO_APP_ROOT", required: true },
  { id: "logics", label: "GetGo Logics source", packageName: "@tnp/getgo-logics", directoryName: "tnp-getgo-logics", environmentVariable: "GETGO_LOGICS_ROOT", required: false },
];

async function commandAvailable(command: string) {
  try {
    await execFileAsync(process.platform === "win32" ? "where.exe" : "which", [command]);
    return true;
  } catch {
    return false;
  }
}

const configured = (name: string) => Boolean(process.env[name]?.trim());

export class StartupEnvironmentService {
  constructor(
    private readonly toolsAppPath: string,
    readonly configurationPath: string,
  ) {}

  private async repositoryChecks(): Promise<StartupEnvironmentCheck[]> {
    return Promise.all(repositories.map(async repository => {
      try {
        const found = await findRelatedRepository(this.toolsAppPath, repository);
        if (found) return {
          id: `repository-${repository.id}`,
          label: repository.label,
          status: "ready" as const,
          message: `Found at ${found}`,
          path: found,
        };
      } catch (cause) {
        return {
          id: `repository-${repository.id}`,
          label: repository.label,
          status: repository.required ? "error" as const : "warning" as const,
          message: cause instanceof Error ? cause.message : String(cause),
          resolution: `Correct ${repository.environmentVariable} in the private .env file.`,
        };
      }
      return {
        id: `repository-${repository.id}`,
        label: repository.label,
        status: repository.required ? "error" as const : "warning" as const,
        message: `${repository.directoryName} was not found nearby.`,
        resolution: `Clone it near GetGo Tools or set ${repository.environmentVariable} in the private .env file.`,
      };
    }));
  }

  private configurationChecks(): StartupEnvironmentCheck[] {
    const firebaseVariables = ["DEVELOPMENT", "STAGING", "PRODUCTION"].flatMap(environment => [
      `GETGO_FIREBASE_${environment}_PROJECT_ID`,
      `GETGO_FIREBASE_${environment}_PROJECT_NUMBER`,
      `GETGO_FIREBASE_${environment}_API_KEY`,
      `GETGO_FIREBASE_${environment}_STORAGE_BUCKET`,
    ]);
    const missingFirebase = firebaseVariables.filter(name => !configured(name));
    return [{
      id: "firebase-configuration",
      label: "Firebase project configuration",
      status: missingFirebase.length ? "error" : "ready",
      message: missingFirebase.length
        ? `Missing ${missingFirebase.join(", ")}.`
        : "Development, staging, and production Firebase projects are configured.",
      resolution: missingFirebase.length ? "Restore the committed .env.example file or override these values in .env." : undefined,
    }, {
      id: "openai-key",
      label: "AI generation",
      status: configured("GETGO_AI_OPENAI_API_KEY") || configured("OPENAI_API_KEY") ? "ready" : "warning",
      message: configured("GETGO_AI_OPENAI_API_KEY") || configured("OPENAI_API_KEY")
        ? "A private OpenAI API key is configured."
        : "No private OpenAI API key is configured; AI generation is unavailable.",
      resolution: "Add GETGO_AI_OPENAI_API_KEY to the private .env file.",
    }, {
      id: "google-secret",
      label: "Google sign-in",
      status: configured("GETGO_GOOGLE_DESKTOP_CLIENT_SECRET") ? "ready" : "warning",
      message: configured("GETGO_GOOGLE_DESKTOP_CLIENT_SECRET")
        ? "The desktop OAuth credential is configured."
        : "The private Google desktop client secret is missing; Google sign-in is unavailable.",
      resolution: "Obtain the secret through the team password manager and add GETGO_GOOGLE_DESKTOP_CLIENT_SECRET to .env.",
    }];
  }

  private async toolChecks(): Promise<StartupEnvironmentCheck[]> {
    const definitions: Array<readonly [string, string, boolean, string]> = [
      ["git", "Git", true, "Install Git and ensure it is on PATH."],
      ["npm", "Node.js and npm", true, "Install Node.js 20, including npm, and ensure it is on PATH."],
      ["tesseract", "Tesseract OCR", false, "Install Tesseract and add it to PATH, or set TESSERACT_PATH."],
      ["firebase", "Firebase CLI", false, "Install with npm install -g firebase-tools when deployment is needed."],
      ["eas", "EAS CLI", false, "Install with npm install -g eas-cli when App cloud workflows are needed."],
      ["adb", "Android SDK tools", false, "Install Android Studio and add Android platform-tools to PATH."],
    ];
    if (process.platform === "darwin")
      definitions.push(["xcodebuild", "Xcode command-line tools", false, "Install Xcode and select its command-line tools."]);
    return Promise.all(definitions.map(async ([command, label, required, resolution]) => {
      const ready = command === "tesseract" && configured("TESSERACT_PATH")
        ? await fs.access(process.env.TESSERACT_PATH!).then(() => true, () => false)
        : await commandAvailable(command);
      return {
        id: `tool-${command}`,
        label,
        status: ready ? "ready" as const : required ? "error" as const : "warning" as const,
        message: ready ? `${command} is available.` : `${command} was not found.`,
        resolution: ready ? undefined : resolution,
      };
    }));
  }

  async check(): Promise<StartupEnvironmentReadiness> {
    const checks = [
      ...await this.repositoryChecks(),
      ...this.configurationChecks(),
      ...await this.toolChecks(),
    ];
    return {
      ready: checks.every(check => check.status !== "error"),
      checkedAt: new Date().toISOString(),
      platform: process.platform,
      configurationPath: this.configurationPath,
      checks,
    };
  }

  async ensureConfigurationFile() {
    await fs.mkdir(path.dirname(this.configurationPath), { recursive: true });
    try {
      await fs.access(this.configurationPath);
    } catch {
      await fs.writeFile(this.configurationPath, [
        "# Private GetGo Tools configuration. Never commit this file.",
        "GETGO_AI_OPENAI_API_KEY=",
        "GETGO_GOOGLE_DESKTOP_CLIENT_SECRET=",
        "",
      ].join("\n"), "utf8");
    }
  }
}
