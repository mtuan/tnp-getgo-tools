import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getSafeWordSyncStatus, syncSafeWordDictionary } from "../src/features/content-safety/repository/content-safety-repository.js";

test("safe words use one canonical file and report generated shared-code status", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "getgo-safe-words-"));
  const quizzes = path.join(workspace, "tnp-getgo-quizzes");
  const source = path.join(quizzes, "content-v2", "safe-words.json");
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, JSON.stringify({ schemaVersion: 1, words: { en: ["bad"], vi: ["xấu"] } }), "utf8");

  assert.equal((await getSafeWordSyncStatus(quizzes)).status, "needs-sync");
  const synchronized = await syncSafeWordDictionary(quizzes);
  assert.equal(synchronized.status, "up-to-date");
  assert.equal((await getSafeWordSyncStatus(quizzes)).status, "up-to-date");
  assert.match(await readFile(synchronized.sharedPath, "utf8"), /"xấu"/u);
  assert.match(await readFile(synchronized.sharedPath, "utf8"), /"allowedPhrases"/u);

  await writeFile(source, JSON.stringify({ schemaVersion: 1, words: { en: ["bad", "worse"], vi: ["xấu"] } }), "utf8");
  assert.equal((await getSafeWordSyncStatus(quizzes)).status, "needs-sync");
});
