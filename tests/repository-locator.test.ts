import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findRelatedRepository } from "../src/shared/main/repository-locator.js";

async function temporaryWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "getgo-repository-locator-"));
}

test("finds a validated repository nested near Tools", async () => {
  const workspace = await temporaryWorkspace();
  try {
    const tools = path.join(workspace, "products", "tnp-getgo-tools");
    const quizzes = path.join(workspace, "products", "content", "tnp-getgo-quizzes");
    await fs.mkdir(path.join(tools, "src"), { recursive: true });
    await fs.mkdir(path.join(quizzes, "quizzes"), { recursive: true });
    await fs.writeFile(path.join(quizzes, "package.json"), JSON.stringify({ name: "@tnp/getgo-quizzes" }));

    assert.equal(await findRelatedRepository(tools, {
      packageName: "@tnp/getgo-quizzes",
      directoryName: "tnp-getgo-quizzes",
      requiredDirectory: "quizzes",
    }), quizzes);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("rejects an invalid explicit repository override", async () => {
  const workspace = await temporaryWorkspace();
  const variable = "GETGO_TEST_REPOSITORY_ROOT";
  process.env[variable] = workspace;
  try {
    await assert.rejects(findRelatedRepository(workspace, {
      packageName: "tnp-getgo-web",
      directoryName: "tnp-getgo-web",
      environmentVariable: variable,
    }), new RegExp(`${variable} does not point to tnp-getgo-web`));
  } finally {
    delete process.env[variable];
    await fs.rm(workspace, { recursive: true, force: true });
  }
});
