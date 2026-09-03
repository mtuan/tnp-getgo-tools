import { useCallback, useEffect, useState } from "react";
import type { StartupEnvironmentReadiness } from "../domain/startup-environment";

function failedReadiness(cause: unknown): StartupEnvironmentReadiness {
  const message = cause instanceof Error ? cause.message : String(cause);
  return {
    ready: false,
    checkedAt: new Date().toISOString(),
    platform: "unknown" as NodeJS.Platform,
    configurationPath: ".env",
    checks: [{
      id: "startup-check",
      label: "Environment verification",
      status: "error",
      message,
      resolution: "Restart GetGo Tools. If the check still fails, reinstall dependencies with npm install.",
    }],
  };
}

export function useStartupEnvironment() {
  const [readiness, setReadiness] = useState<StartupEnvironmentReadiness | null>(null);
  const [checking, setChecking] = useState(true);
  const check = useCallback(async () => {
    setChecking(true);
    try {
      setReadiness(await window.getgo.checkStartupEnvironment());
    } catch (cause) {
      setReadiness(failedReadiness(cause));
    } finally {
      setChecking(false);
    }
  }, []);
  useEffect(() => void check(), [check]);
  return { readiness, checking, check };
}
