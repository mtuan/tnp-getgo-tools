import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  contentDirectoryRoot,
  contentTopicsRoot,
  getGoContentSource,
} from "../src/features/topics/repository/content-source.js";

function withSource(value: string | undefined, run: () => void): void {
  const previous = process.env.GETGO_CONTENT_SOURCE;
  if (value === undefined) delete process.env.GETGO_CONTENT_SOURCE;
  else process.env.GETGO_CONTENT_SOURCE = value;
  try { run(); }
  finally {
    if (previous === undefined) delete process.env.GETGO_CONTENT_SOURCE;
    else process.env.GETGO_CONTENT_SOURCE = previous;
  }
}

test("content source defaults to content-v2", () => withSource(undefined, () => {
  assert.equal(getGoContentSource(), "content-v2");
  assert.equal(contentTopicsRoot("repo"), path.resolve("repo", "content-v2", "topics"));
}));

test("content source can switch to converted content", () => withSource("content", () => {
  assert.equal(getGoContentSource(), "content");
  assert.equal(contentDirectoryRoot("repo"), path.resolve("repo", "content"));
  assert.equal(contentTopicsRoot("repo"), path.resolve("repo", "content", "topics"));
}));

test("content source rejects unknown directories", () => withSource("other", () => {
  assert.throws(() => getGoContentSource(), /GETGO_CONTENT_SOURCE/);
}));
