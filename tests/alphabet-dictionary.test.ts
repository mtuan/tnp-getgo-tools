import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  localizedAlphabetDictionary,
  loadAlphabetDictionary,
  parseKidLearningDictionary,
  saveAlphabetDictionary,
} from "../src/features/quiz-editor/repository/alphabet-dictionary.js";

test("expands multilingual aliases into localized quiz words", () => {
  const shared = parseKidLearningDictionary({
    schemaVersion: 2,
    entries: [{
      id: "apple",
      image: "asset:apple.svg",
      minimumAge: 3,
      translations: {
        en: { text: "Apple", meaning: "A round fruit." },
        vi: { text: "táo", classifier: "quả", meaning: "Một loại quả.", aliases: [{ text: "quả táo" }] },
      },
    }],
  });
  assert.deepEqual(localizedAlphabetDictionary(shared, "vi").words.map((word) => word.text), ["táo", "quả táo"]);
});

test("loads and sanitizes a quiz-level alphabet dictionary", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "getgo-alphabet-dictionary-"),
  );
  const manifestPath = path.join(directory, "manifest.json");
  await fs.writeFile(manifestPath, "{}");
  await fs.writeFile(
    path.join(directory, "dict.json"),
    JSON.stringify({
      schemaVersion: 1,
      words: [
        {
          text: "chó",
          classifier: "con",
          meaning: "Vật nuôi sống cùng con người.",
          image: "asset:dog.png",
          minimumAge: 3,
          authoringOnly: true,
        },
      ],
    }),
  );

  assert.deepEqual(await loadAlphabetDictionary(manifestPath), {
    schemaVersion: 1,
    words: [
      {
        text: "chó",
        classifier: "con",
        meaning: "Vật nuôi sống cùng con người.",
        image: "asset:dog.png",
        minimumAge: 3,
      },
    ],
  });
});

test("returns an empty dictionary when dict.json does not exist", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "getgo-empty-alphabet-dictionary-"),
  );
  assert.deepEqual(
    await loadAlphabetDictionary(path.join(directory, "manifest.json")),
    { schemaVersion: 1, words: [] },
  );
});

test("validates and saves a quiz-level alphabet dictionary", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "getgo-save-alphabet-dictionary-"),
  );
  const manifestPath = path.join(directory, "manifest.json");
  await fs.writeFile(manifestPath, "{}");
  const dictionary = {
    schemaVersion: 1 as const,
    words: [
      {
        text: "Apple",
        meaning: "A round fruit.",
        image: "asset:apple.svg",
        minimumAge: 3,
      },
    ],
  };

  assert.deepEqual(await saveAlphabetDictionary(manifestPath, dictionary), dictionary);
  assert.deepEqual(await loadAlphabetDictionary(manifestPath), dictionary);
});

test("rejects a classifier already included in dictionary text", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "getgo-duplicate-classifier-"),
  );
  const manifestPath = path.join(directory, "manifest.json");
  await fs.writeFile(manifestPath, "{}");
  await fs.writeFile(
    path.join(directory, "dict.json"),
    JSON.stringify({
      schemaVersion: 1,
      words: [
        {
          text: "đồng xu",
          classifier: "đồng",
          meaning: "Miếng tiền nhỏ.",
          image: "asset:coin.png",
          minimumAge: 4,
        },
      ],
    }),
  );

  await assert.rejects(
    loadAlphabetDictionary(manifestPath),
    /text already contains its classifier/,
  );
});
