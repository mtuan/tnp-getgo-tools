function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

export function assertAllowedExternalUrl(requestedUrl: unknown): URL {
  if (typeof requestedUrl !== "string") throw new Error("Invalid URL");
  const url = new URL(requestedUrl);
  const hosts = new Set(["tnp-getgo-dev.web.app", "tnp-getgo-stg.web.app", "tnp-getgo.web.app", "platform.openai.com", "artofproblemsolving.com", "youtube.com", "www.youtube.com", "youtu.be"]);
  const firebasePaths = ["/project/tnp-getgo-dev/", "/project/tnp-getgo-stg/", "/project/tnp-getgo/"];
  const firebase = url.hostname === "console.firebase.google.com" && firebasePaths.some((prefix) => url.pathname.startsWith(prefix));
  const local = ["http:", "https:"].includes(url.protocol)
    && (["localhost", "127.0.0.1"].includes(url.hostname) || isPrivateIpv4(url.hostname))
    && ["5173", "8081", "8766"].includes(url.port);
  if (!local && (url.protocol !== "https:" || (!hosts.has(url.hostname) && !firebase)))
    throw new Error("External URL is not allowed");
  return url;
}
