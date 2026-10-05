import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SettingsStore } from "../src/features/settings/main/settings.js";

test("local Web protocol defaults safely and persists the last successful choice", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "getgo-tools-settings-"));
  try {
    await writeFile(path.join(root, "settings.json"), JSON.stringify({
      repositoryPath: null,
      environment: "development",
      aiProfile: "thorough",
      locale: "en",
    }));
    const store = new SettingsStore(root, root);
    assert.equal((await store.read()).localWebProtocol, "https");

    await store.update({ localWebProtocol: "http" });
    assert.equal((await store.read()).localWebProtocol, "http");
    assert.equal(JSON.parse(await readFile(path.join(root, "settings.json"), "utf8")).localWebProtocol, "http");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
