import { GetGoIcon } from "./GetGoIcon";

export function StartupLoadingScreen({
  settingsLoaded,
}: {
  settingsLoaded: boolean;
}) {
  return (
    <main className="startup-loading" role="status" aria-live="polite">
      <div className="startup-loading-icon">
        <GetGoIcon size={76} />
      </div>
      <strong>GetGo Tools</strong>
      <span>
        {settingsLoaded
          ? "Loading repository structure…"
          : "Preparing your workspace…"}
      </span>
      <div className="startup-loading-progress" aria-hidden="true">
        <i />
      </div>
    </main>
  );
}
