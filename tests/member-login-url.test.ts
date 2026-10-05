import assert from "node:assert/strict";
import test from "node:test";
import { memberLoginUrl } from "../src/features/members/domain/member-login-url.ts";

test("member login URLs target the selected GetGo environment", () => {
  assert.equal(new URL(memberLoginUrl("development", "member@example.com")).origin, "http://localhost:5173");
  assert.equal(new URL(memberLoginUrl("staging", "member@example.com")).origin, "https://tnp-getgo-stg.web.app");
  assert.equal(new URL(memberLoginUrl("production", "member@example.com")).origin, "https://tnp-getgo.web.app");
});

test("member login URLs carry only the username handoff", () => {
  const url = new URL(memberLoginUrl("development", " member+one@example.com "));
  assert.equal(url.pathname, "/auth/login");
  assert.equal(url.searchParams.get("app"), "getgo");
  assert.equal(url.searchParams.get("returnUrl"), "/parent/home");
  assert.equal(url.searchParams.get("username"), "member+one@example.com");
  assert.equal(url.searchParams.has("password"), false);
});
