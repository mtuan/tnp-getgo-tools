export type WebReleaseTab = "builds" | "jobs";

const releaseTabs = new Set<WebReleaseTab>(["builds", "jobs"]);

export function webReleaseTabFromRoute(route: string): WebReleaseTab {
  try {
    const tab = new URL(route, "app://getgo").searchParams.get("tab") as WebReleaseTab | null;
    return tab && releaseTabs.has(tab) ? tab : "builds";
  } catch {
    return "builds";
  }
}
