import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function interfacePriority(name: string) {
  if (/^(en\d+|eth\d+|wlan\d+|wi-?fi|ethernet)/i.test(name)) return 0;
  if (/^(utun|tun|tap|docker|vbox|vmnet|bridge|tailscale)/i.test(name)) return 2;
  return 1;
}

export function resolveLanAddress(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string | undefined {
  const addresses = Object.entries(interfaces)
    .flatMap(([name, entries]) => (entries ?? []).map(entry => ({ name, entry })))
    .filter(({ entry }) => entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254."))
    .sort((left, right) => interfacePriority(left.name) - interfacePriority(right.name));
  return addresses.find(({ entry }) => isPrivateIpv4(entry.address))?.entry.address
    ?? addresses[0]?.entry.address;
}

export function resolveLocalNetworkUrl(localUrl: string) {
  const address = resolveLanAddress();
  if (!address) return undefined;
  const networkUrl = new URL(localUrl);
  networkUrl.hostname = address;
  return networkUrl.toString().replace(/\/$/, "");
}
