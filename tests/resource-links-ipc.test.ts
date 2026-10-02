import test from "node:test";
import assert from "node:assert/strict";
import { assertAllowedExternalUrl } from "../src/features/topics/main/external-url-policy.js";

test("allows the configured HTTPS localhost Web runtime", () => {
  assert.equal(
    assertAllowedExternalUrl("https://localhost:5173").toString(),
    "https://localhost:5173/",
  );
});

test("allows supported HTTP local development services", () => {
  assert.equal(
    assertAllowedExternalUrl("http://127.0.0.1:8766").toString(),
    "http://127.0.0.1:8766/",
  );
  assert.equal(
    assertAllowedExternalUrl("http://192.168.1.8:5173").toString(),
    "http://192.168.1.8:5173/",
  );
});

test("rejects unsupported local ports and unsafe schemes", () => {
  assert.throws(
    () => assertAllowedExternalUrl("https://localhost:9999"),
    /External URL is not allowed/,
  );
  assert.throws(
    () => assertAllowedExternalUrl("file:///tmp/example.html"),
    /External URL is not allowed/,
  );
});
