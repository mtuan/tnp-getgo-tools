import assert from "node:assert/strict";
import test from "node:test";
import {
  alphabetWordStartsWithLetter,
  formatAlphabetWord,
  isAlphabetLetterCharacter,
} from "../src/core/alphabet-letter.js";

test("matches English alphabet letters without case sensitivity", () => {
  assert.equal(isAlphabetLetterCharacter("D", "d", "English"), true);
  assert.equal(isAlphabetLetterCharacter("d", "D", "English"), true);
  assert.equal(isAlphabetLetterCharacter("Đ", "D", "English"), false);
});

test("filters dictionary words starting with the active letter", () => {
  assert.equal(alphabetWordStartsWithLetter("Apple", "A", "English"), true);
  assert.equal(alphabetWordStartsWithLetter("banana", "A", "English"), false);
  assert.equal(alphabetWordStartsWithLetter("áo", "A", "Vietnamese"), true);
  assert.equal(alphabetWordStartsWithLetter("táo", "A", "Vietnamese"), false);
  assert.equal(alphabetWordStartsWithLetter("dâu tây", "Ă", "Vietnamese"), false);
});

test("matches Vietnamese tone variants while preserving distinct letters", () => {
  for (const character of ["a", "á", "à", "ả", "ã", "ạ"]) {
    assert.equal(isAlphabetLetterCharacter(character, "A", "Vietnamese"), true);
  }
  assert.equal(isAlphabetLetterCharacter("ă", "A", "Vietnamese"), false);
  assert.equal(isAlphabetLetterCharacter("â", "A", "Vietnamese"), false);
  assert.equal(isAlphabetLetterCharacter("ắ", "Ă", "Vietnamese"), true);
  assert.equal(isAlphabetLetterCharacter("ậ", "Â", "Vietnamese"), true);
  assert.equal(isAlphabetLetterCharacter("đ", "D", "Vietnamese"), false);
  assert.equal(isAlphabetLetterCharacter("đ", "Đ", "Vietnamese"), true);
});

test("formats classifiers without duplicating an existing word prefix", () => {
  assert.equal(formatAlphabetWord("chó", "con"), "con chó");
  assert.equal(formatAlphabetWord("đồng xu", "đồng"), "đồng xu");
  assert.equal(formatAlphabetWord("quyển sách", "quyển"), "quyển sách");
  assert.equal(formatAlphabetWord("hạt", "hạt"), "hạt");
});
