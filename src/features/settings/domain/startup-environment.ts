export interface StartupEnvironmentCheck {
  id: string;
  label: string;
  status: "ready" | "warning" | "error";
  message: string;
  resolution?: string;
  path?: string;
}

export interface StartupEnvironmentReadiness {
  ready: boolean;
  checkedAt: string;
  platform: NodeJS.Platform;
  configurationPath: string;
  checks: StartupEnvironmentCheck[];
}
