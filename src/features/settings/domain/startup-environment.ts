export interface StartupEnvironmentCheck {
  id: string;
  label: string;
  category: "projects" | "configuration" | "commands" | "tools";
  status: "ready" | "warning" | "error";
  message: string;
  resolution?: string;
  path?: string;
  action?: "select-path" | "enter-secret" | "install";
  configurationKey?: string;
}

export interface StartupEnvironmentReadiness {
  ready: boolean;
  checkedAt: string;
  platform: NodeJS.Platform;
  configurationPath: string;
  checks: StartupEnvironmentCheck[];
}

export interface StartupEnvironmentActionResult {
  readiness: StartupEnvironmentReadiness;
  requiresRestart?: boolean;
}

export interface StartupEnvironmentDesktopApi {
  checkStartupEnvironment(mockIssues?: boolean): Promise<StartupEnvironmentReadiness>;
  openEnvironmentConfiguration(): Promise<void>;
  resolveStartupRepository(checkId: string, preview?: boolean): Promise<StartupEnvironmentActionResult | null>;
  saveStartupSecret(checkId: string, value: string): Promise<StartupEnvironmentActionResult>;
  installStartupDependency(checkId: string): Promise<StartupEnvironmentActionResult>;
}
