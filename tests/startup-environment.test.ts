import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StartupEnvironmentService } from "../src/features/settings/main/startup-environment.js";

test("saves only allowlisted secrets in the private environment file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "getgo-startup-env-"));
  const environmentPath = path.join(root, ".env");
  const previous = process.env.GETGO_AI_OPENAI_API_KEY;
  try {
    const service = new StartupEnvironmentService(root, environmentPath);
    await service.setSecret("openai-key", "value with spaces");
    assert.match(await readFile(environmentPath, "utf8"), /GETGO_AI_OPENAI_API_KEY="value with spaces"/);
    await assert.rejects(() => service.setSecret("arbitrary", "secret"), /Unknown secret/);
  } finally {
    if (previous === undefined) delete process.env.GETGO_AI_OPENAI_API_KEY;
    else process.env.GETGO_AI_OPENAI_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("validates a selected repository before persisting its path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "getgo-startup-path-"));
  const repository = path.join(root, "tnp-getgo-web");
  const environmentPath = path.join(root, ".env");
  const previous = process.env.GETGO_WEB_ROOT;
  try {
    await mkdir(repository);
    await writeFile(path.join(repository, "package.json"), JSON.stringify({ name: "tnp-getgo-web" }));
    const service = new StartupEnvironmentService(root, environmentPath);
    await service.setRepositoryPath("repository-web", repository);
    assert.match(await readFile(environmentPath, "utf8"), /GETGO_WEB_ROOT=/);
    await assert.rejects(() => service.setRepositoryPath("repository-app", repository), /does not point/);
  } finally {
    if (previous === undefined) delete process.env.GETGO_WEB_ROOT;
    else process.env.GETGO_WEB_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
