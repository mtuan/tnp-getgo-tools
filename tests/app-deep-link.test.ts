import assert from "node:assert/strict";
import test from "node:test";
import {
  routeFromGetGoToolsArguments,
  routeFromGetGoToolsUrl,
} from "../src/shared/domain/app-deep-link.js";

test("converts a GetGo Tools deep link to an internal route", () => {
  assert.equal(
    routeFromGetGoToolsUrl(
      "getgo-tools:///topics/archimedes-maths-3e2/quizzes/pot-4-2?tab=questions",
    ),
    "/topics/archimedes-maths-3e2/quizzes/pot-4-2?tab=questions",
  );
});

test("finds a deep link among Electron launch arguments", () => {
  assert.equal(
    routeFromGetGoToolsArguments([
      "/Applications/GetGo Tools.app",
      "getgo-tools:///topics/example/quizzes/sample/questions/3?tab=dynamic",
    ]),
    "/topics/example/quizzes/sample/questions/3?tab=dynamic",
  );
});

test("rejects unrelated protocols and host-based lookalikes", () => {
  assert.equal(routeFromGetGoToolsUrl("https://example.com/topics/example"), null);
  assert.equal(routeFromGetGoToolsUrl("getgo-tools://evil.example/topics/example"), null);
});
