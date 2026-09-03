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

const secretVariables: Record<string, string> = {
  "openai-key": "GETGO_AI_OPENAI_API_KEY",
  "google-secret": "GETGO_GOOGLE_DESKTOP_CLIENT_SECRET",
};

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
    private readonly mockIssues = false,
  ) {}

  private async repositoryChecks(): Promise<StartupEnvironmentCheck[]> {
    return Promise.all(repositories.map(async repository => {
      try {
        const found = this.mockIssues ? null : await findRelatedRepository(this.toolsAppPath, repository);
        if (found) return {
          id: `repository-${repository.id}`,
          label: repository.label,
          category: "projects" as const,
          status: "ready" as const,
          message: `Found at ${found}`,
          path: found,
        };
      } catch (cause) {
        return {
          id: `repository-${repository.id}`,
          label: repository.label,
          category: "projects" as const,
          status: repository.required ? "error" as const : "warning" as const,
          message: cause instanceof Error ? cause.message : String(cause),
          resolution: `Correct ${repository.environmentVariable} in the private .env file.`,
          action: "select-path" as const,
        };
      }
      return {
        id: `repository-${repository.id}`,
        label: repository.label,
        category: "projects" as const,
        status: repository.required ? "error" as const : "warning" as const,
        message: `${repository.directoryName} was not found nearby.`,
        resolution: `Clone it near GetGo Tools or set ${repository.environmentVariable} in the private .env file.`,
        action: "select-path" as const,
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
    const isConfigured = (name: string) => !this.mockIssues && configured(name);
    const missingFirebase = firebaseVariables.filter(name => !isConfigured(name));
    return [{
      id: "firebase-configuration",
      label: "Firebase project configuration",
      category: "configuration",
      status: missingFirebase.length ? "error" : "ready",
      message: missingFirebase.length
        ? `Missing ${missingFirebase.join(", ")}.`
        : "Development, staging, and production Firebase projects are configured.",
      resolution: missingFirebase.length ? "Copy .env.example to the private .env file, then obtain the missing Firebase values through the team password manager." : undefined,
    }, {
      id: "openai-key",
      label: "AI generation",
      category: "configuration",
      status: isConfigured("GETGO_AI_OPENAI_API_KEY") || isConfigured("OPENAI_API_KEY") ? "ready" : "warning",
      message: isConfigured("GETGO_AI_OPENAI_API_KEY") || isConfigured("OPENAI_API_KEY")
        ? "A private OpenAI API key is configured."
        : "No private OpenAI API key is configured; AI generation is unavailable.",
      resolution: isConfigured("GETGO_AI_OPENAI_API_KEY") || isConfigured("OPENAI_API_KEY")
        ? undefined : "Add GETGO_AI_OPENAI_API_KEY to the private .env file.",
      action: isConfigured("GETGO_AI_OPENAI_API_KEY") || isConfigured("OPENAI_API_KEY") ? undefined : "enter-secret",
      configurationKey: "GETGO_AI_OPENAI_API_KEY",
    }, {
      id: "google-secret",
      label: "Google sign-in",
      category: "configuration",
      status: isConfigured("GETGO_GOOGLE_DESKTOP_CLIENT_SECRET") ? "ready" : "warning",
      message: isConfigured("GETGO_GOOGLE_DESKTOP_CLIENT_SECRET")
        ? "The desktop OAuth credential is configured."
        : "The private Google desktop client secret is missing; Google sign-in is unavailable.",
      resolution: isConfigured("GETGO_GOOGLE_DESKTOP_CLIENT_SECRET")
        ? undefined : "Obtain the secret through the team password manager and add GETGO_GOOGLE_DESKTOP_CLIENT_SECRET to .env.",
      action: isConfigured("GETGO_GOOGLE_DESKTOP_CLIENT_SECRET") ? undefined : "enter-secret",
      configurationKey: "GETGO_GOOGLE_DESKTOP_CLIENT_SECRET",
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
      const ready = this.mockIssues ? false : command === "tesseract" && configured("TESSERACT_PATH")
        ? await fs.access(process.env.TESSERACT_PATH!).then(() => true, () => false)
        : await commandAvailable(command);
      return {
        id: `tool-${command}`,
        label,
        category: required ? "commands" as const : "tools" as const,
        status: ready ? "ready" as const : required ? "error" as const : "warning" as const,
        message: ready ? `${command} is available.` : `${command} was not found.`,
        resolution: ready ? undefined : resolution,
        action: ready ? undefined : "install" as const,
      };
    }));
  }

  private async dependencyChecks(): Promise<StartupEnvironmentCheck[]> {
    const projects = [{ id: "tools", label: "GetGo Tools", path: this.toolsAppPath }, ...await Promise.all(
      repositories.filter(item => item.required).map(async item => ({
        id: item.id,
        label: item.label,
        path: await findRelatedRepository(this.toolsAppPath, item).catch(() => null),
      })),
    )];
    return Promise.all(projects.filter(project => project.path).map(async project => {
      const ready = !this.mockIssues && await fs.stat(path.join(project.path!, "node_modules"))
        .then(value => value.isDirectory(), () => false);
      return {
        id: `dependencies-${project.id}`,
        label: `${project.label} dependencies`,
        category: "tools" as const,
        status: ready ? "ready" as const : "warning" as const,
        message: ready ? "Project dependencies are installed." : "The node_modules directory is missing.",
        resolution: ready ? undefined : "Run npm install in this project.",
        path: project.path!,
        action: ready ? undefined : "install" as const,
      };
    }));
  }

  async check(): Promise<StartupEnvironmentReadiness> {
    const checks = [
      ...await this.repositoryChecks(),
      ...this.configurationChecks(),
      ...await this.toolChecks(),
      ...await this.dependencyChecks(),
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

  repository(checkId: string) {
    return repositories.find(item => `repository-${item.id}` === checkId) ?? null;
  }

  async setRepositoryPath(checkId: string, selectedPath: string) {
    const repository = this.repository(checkId);
    if (!repository) throw new Error("Unknown repository check.");
    const previous = process.env[repository.environmentVariable];
    process.env[repository.environmentVariable] = selectedPath;
    try {
      await this.validateRepositoryPath(checkId, selectedPath);
      await this.writeEnvironmentValue(repository.environmentVariable, selectedPath);
    } catch (cause) {
      if (previous === undefined) delete process.env[repository.environmentVariable];
      else process.env[repository.environmentVariable] = previous;
      throw cause;
    }
  }

  async validateRepositoryPath(checkId: string, selectedPath: string) {
    const repository = this.repository(checkId);
    if (!repository) throw new Error("Unknown repository check.");
    const previous = process.env[repository.environmentVariable];
    process.env[repository.environmentVariable] = selectedPath;
    try { await findRelatedRepository(this.toolsAppPath, repository); }
    finally {
      if (previous === undefined) delete process.env[repository.environmentVariable];
      else process.env[repository.environmentVariable] = previous;
    }
  }

  async setSecret(checkId: string, value: string) {
    const variable = secretVariables[checkId];
    if (!variable) throw new Error("Unknown secret configuration.");
    const secret = value.trim();
    if (!secret) throw new Error("Secret value cannot be empty.");
    await this.writeEnvironmentValue(variable, secret);
    process.env[variable] = secret;
  }

  private async writeEnvironmentValue(name: string, value: string) {
    await this.ensureConfigurationFile();
    const source = await fs.readFile(this.configurationPath, "utf8");
    const encoded = JSON.stringify(value);
    const matcher = new RegExp(`^${name}=.*$`, "m");
    const next = matcher.test(source)
      ? source.replace(matcher, `${name}=${encoded}`)
      : `${source.replace(/\s*$/, "\n")}${name}=${encoded}\n`;
    await fs.writeFile(this.configurationPath, next, { encoding: "utf8", mode: 0o600 });
    if (process.platform !== "win32") await fs.chmod(this.configurationPath, 0o600);
  }

  async install(checkId: string) {
    if (checkId.startsWith("dependencies-")) {
      const id = checkId.slice("dependencies-".length);
      const repository = repositories.find(item => item.id === id);
      const projectPath = id === "tools" ? this.toolsAppPath
        : repository ? await findRelatedRepository(this.toolsAppPath, repository) : null;
      if (!projectPath) throw new Error(`Cannot install dependencies because the ${id} project was not found.`);
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      await execFileAsync(npm, ["install"], { cwd: projectPath, maxBuffer: 10 * 1024 * 1024 });
      return;
    }
    const command = checkId.replace(/^tool-/, "");
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const installers: Record<string, readonly [string, string[]]> = process.platform === "win32" ? {
      git: ["winget", ["install", "--id", "Git.Git", "-e", "--accept-package-agreements", "--accept-source-agreements"]],
      npm: ["winget", ["install", "--id", "OpenJS.NodeJS.LTS", "-e", "--accept-package-agreements", "--accept-source-agreements"]],
      tesseract: ["winget", ["install", "--id", "UB-Mannheim.TesseractOCR", "-e", "--accept-package-agreements", "--accept-source-agreements"]],
      firebase: [npm, ["install", "-g", "firebase-tools"]],
      eas: [npm, ["install", "-g", "eas-cli"]],
      adb: ["winget", ["install", "--id", "Google.PlatformTools", "-e", "--accept-package-agreements", "--accept-source-agreements"]],
    } : {
      git: ["xcode-select", ["--install"]],
      npm: ["brew", ["install", "node"]],
      tesseract: ["brew", ["install", "tesseract"]],
      firebase: [npm, ["install", "-g", "firebase-tools"]],
      eas: [npm, ["install", "-g", "eas-cli"]],
      adb: ["brew", ["install", "--cask", "android-platform-tools"]],
      xcodebuild: ["xcode-select", ["--install"]],
    };
    const installer = installers[command];
    if (!installer) throw new Error(`No automatic installer is available for ${checkId} on ${process.platform}.`);
    await execFileAsync(installer[0], installer[1], { maxBuffer: 10 * 1024 * 1024 });
  }
}
