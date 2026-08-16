import { clipboard, shell, type IpcMain } from "electron";

function videoIdFromUrl(requestedUrl: string): string {
  const parsed = new URL(requestedUrl);
  const host = parsed.hostname.toLowerCase();
  let videoId = host === "youtu.be"
    ? parsed.pathname.split("/").filter(Boolean)[0]
    : parsed.searchParams.get("v") ?? undefined;
  if (!videoId && (host === "youtube.com" || host.endsWith(".youtube.com"))) {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live"].includes(parts[0])) videoId = parts[1];
  }
  if (
    (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com")) ||
    !videoId || !/^[\w-]{6,20}$/.test(videoId)
  ) throw new Error("Not a valid YouTube video URL");
  return videoId;
}

function readDuration(watchHtml: string): number | undefined {
  const seconds = watchHtml.match(/(?:"|\\")lengthSeconds(?:"|\\")\s*:\s*(?:"|\\")?(\d+)/);
  const milliseconds = watchHtml.match(/(?:"|\\")approxDurationMs(?:"|\\")\s*:\s*(?:"|\\")?(\d+)/);
  const duration = seconds
    ? Number(seconds[1])
    : milliseconds ? Math.round(Number(milliseconds[1]) / 1000) : Number.NaN;
  return Number.isSafeInteger(duration) && duration > 0 ? duration : undefined;
}

async function resolveYoutubeUrl(requestedUrl: string) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoIdFromUrl(requestedUrl)}`;
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("format", "json");
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    const watchResponse = await fetch(`${url}&hl=en`, {
      headers: { "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response.ok) throw new Error(`YouTube returned ${response.status}`);
    const metadata = (await response.json()) as { title?: unknown };
    if (typeof metadata.title !== "string" || !metadata.title.trim())
      throw new Error("YouTube returned no title");
    let durationSeconds = watchResponse?.ok
      ? readDuration(await watchResponse.text()) : undefined;
    if (!durationSeconds) {
      const retry = await fetch(`${url}&hl=en&gl=US&bpctr=9999999999&has_verified=1`, {
        headers: { "accept-language": "en-US,en;q=0.9", "cache-control": "no-cache" },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (retry?.ok) durationSeconds = readDuration(await retry.text());
    }
    return { url, title: metadata.title.trim(), ...(durationSeconds ? { durationSeconds } : {}) };
  } catch (cause) {
    return { url: requestedUrl, error: cause instanceof Error ? cause.message : String(cause) };
  }
}

function assertAllowedExternalUrl(requestedUrl: unknown): URL {
  if (typeof requestedUrl !== "string") throw new Error("Invalid URL");
  const url = new URL(requestedUrl);
  const hosts = new Set(["tnp-getgo-dev.web.app", "tnp-getgo-stg.web.app", "tnp-getgo.web.app", "platform.openai.com", "youtube.com", "www.youtube.com", "youtu.be"]);
  const firebasePaths = ["/project/tnp-getgo-dev/", "/project/tnp-getgo-stg/", "/project/tnp-getgo/"];
  const firebase = url.hostname === "console.firebase.google.com" && firebasePaths.some((prefix) => url.pathname.startsWith(prefix));
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "5173";
  if (!local && (url.protocol !== "https:" || (!hosts.has(url.hostname) && !firebase)))
    throw new Error("External URL is not allowed");
  return url;
}

export function registerResourceLinksIpc(ipc: IpcMain): void {
  ipc.handle("clipboard:write", (_event, text: unknown) => {
    // Deployment reports can contain complete multi-step command output.
    // Keep type validation at the IPC boundary without imposing a tiny
    // message-length limit that makes the shared copy action fail.
    if (typeof text !== "string" || text.length > 10_000_000)
      throw new Error("Invalid clipboard text");
    clipboard.writeText(text);
  });
  ipc.handle("resources:youtube:resolve", async (_event, input: unknown) => {
    if (!Array.isArray(input) || input.length > 100 || input.some((value) => typeof value !== "string"))
      throw new Error("Paste up to 100 YouTube links at a time.");
    return Promise.all(input.map((url) => resolveYoutubeUrl(url as string)));
  });
  ipc.handle("shell:open-external", async (_event, requestedUrl: unknown) => {
    await shell.openExternal(assertAllowedExternalUrl(requestedUrl).toString());
  });
}
