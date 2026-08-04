import assert from "node:assert/strict"
import test from "node:test"
import { visibleModelValue } from "../src/core/editor-context.js"

test("extracts only editable code from a Monaco type-context model", () => {
  const prefix = "export {}\nconst hidden = 1\nconst callback =\n"
  const suffix = "\n"
  assert.equal(visibleModelValue(`${prefix}({ value }) => value${suffix}`, prefix, suffix), "({ value }) => value")
})

test("rejects a model when Monaco changes protected context", () => {
  const prefix = "export {}\nconst callback =\n"
  assert.equal(visibleModelValue("export {};\nconst callback = () => 1\n", prefix, "\n"), null)
  assert.equal(visibleModelValue(`${prefix}() => 1`, prefix, "\n"), null)
})
