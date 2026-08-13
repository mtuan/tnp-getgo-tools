import assert from "node:assert/strict";
import test from "node:test";
import { dictionaryStartingLetters, dictionaryWordsStartWith } from "../src/features/topics/domain/dictionary-letter-filter";

test("derives and matches starting letters from English words only", () => {
  const rows = [
    { enText: "apple", viText: "áo" },
    { enText: "banana", viText: "ẵm" },
    { viText: "ận" },
  ];
  assert.deepEqual(dictionaryStartingLetters(rows, "en"), ["A", "B"]);
  assert.equal(dictionaryWordsStartWith(rows[0], "A"), true);
  assert.equal(dictionaryWordsStartWith(rows[1], "B"), true);
  assert.equal(dictionaryWordsStartWith(rows[2], "A"), false);
});
