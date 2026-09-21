import assert from "node:assert/strict";
import type { NetworkInterfaceInfo } from "node:os";
import test from "node:test";
import { resolveLanAddress } from "../src/features/deployment/main/local-network-address.js";

function address(value: string, internal = false): NetworkInterfaceInfo {
  return { address: value, netmask: "255.255.255.0", family: "IPv4", mac: "00:00:00:00:00:00", internal, cidr: `${value}/24` };
}

test("LAN address prefers a private external IPv4 address", () => {
  assert.equal(resolveLanAddress({
    lo0: [address("127.0.0.1", true)],
    utun3: [address("10.8.0.2")],
    en0: [address("192.168.1.42")],
  }), "192.168.1.42");
});

test("LAN address ignores link-local and internal addresses", () => {
  assert.equal(resolveLanAddress({
    lo0: [address("127.0.0.1", true)],
    en0: [address("169.254.10.20")],
  }), undefined);
});
