import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  containsContentV2InlineImage,
  extractContentV2InlineImageAssets,
} from "../src/features/topics/repository/content-v2-inline-assets.js";

test("extracts repeated inline images once and replaces every occurrence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-inline-assets-"));
  const dataUrl = `data:image/png;base64,${Buffer.from("same image").toString("base64")}`;
  const source = {
    answer: { choices: { A: dataUrl } },
    dynamic: {
      questionGeneratorTs: `return ${JSON.stringify(dataUrl)};`,
      compiledJs: `const image = ${JSON.stringify(dataUrl)};`,
    },
  };

  const result = await extractContentV2InlineImageAssets(source, root);
  assert.equal(result.extractedCount, 1);
  assert.equal(containsContentV2InlineImage(result.value), false);
  const serialized = JSON.stringify(result.value);
  const references = serialized.match(/asset:inline-[a-f0-9]{20}\.png/g) ?? [];
  assert.equal(references.length, 3);
  assert.equal(new Set(references).size, 1);
  assert.equal((await fs.readdir(root)).length, 1);
});

test("leaves content without inline images unchanged", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "getgo-inline-assets-"));
  const source = { image: "asset:question-1.png" };
  const result = await extractContentV2InlineImageAssets(source, root);
  assert.equal(result.extractedCount, 0);
  assert.equal(result.value, source);
  assert.deepEqual(await fs.readdir(root), []);
});
