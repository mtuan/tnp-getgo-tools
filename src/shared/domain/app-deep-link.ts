export const GETGO_TOOLS_PROTOCOL = "getgo-tools";

const supportedRoots = new Set([
  "dashboard",
  "feedbacks",
  "jobs",
  "deploy",
  "image-pdf",
  "screenshots",
  "designs",
  "avatar-sets",
  "payments",
  "payment-packages",
  "safe-words",
  "settings",
  "topics",
  "quizzes",
]);

/** Convert a public GetGo Tools URL into the app's existing internal route. */
export function routeFromGetGoToolsUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== `${GETGO_TOOLS_PROTOCOL}:` || url.hostname) return null;
  const root = url.pathname.split("/").filter(Boolean)[0];
  if (!root || !supportedRoots.has(root)) return null;
  return `${url.pathname}${url.search}`;
}

export function routeFromGetGoToolsArguments(args: readonly string[]): string | null {
  for (const argument of args) {
    const route = routeFromGetGoToolsUrl(argument);
    if (route) return route;
  }
  return null;
}
