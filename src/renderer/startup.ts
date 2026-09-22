// Load the React module graph behind a catch boundary: static import failures
// otherwise leave the initial HTML "Preparing…" screen visible forever.
import en from "../shared/localization/en.json";
import vi from "../shared/localization/vi.json";

function showStartupFailure(cause: unknown) {
  console.error("[GetGo Tools][Renderer startup] Failed to initialize", cause);
  const shell = document.querySelector(".startup-shell");
  if (!shell) return;
  shell.setAttribute("role", "alert");
  const message = shell.querySelector("span");
  if (message) message.textContent = (navigator.language.startsWith("vi") ? vi : en).startupFailure;
  shell.querySelector(".startup-shell-progress")?.remove();
}

void import("./main").catch(showStartupFailure);
