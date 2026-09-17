import test from "node:test";
import assert from "node:assert/strict";
import { getGoWebRuntimeConfig, getGoDesignRuntimeConfig } from "../src/features/deployment/main/local-web-runtime.js";

test("localhost web selects the npm script for the requested backend environment", () => {
  for (const [target, script] of [["development", "dev:getgo:dev"], ["staging", "dev:getgo:staging"], ["production", "dev:getgo:production"]] as const) {
    assert.deepEqual(getGoWebRuntimeConfig.command(target), ["run", script, "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"]);
  }
});

test("design server still does not require Firebase or an environment-specific command", () => {
  assert.equal(getGoDesignRuntimeConfig.requiresFirebaseConfig, false);
  assert.deepEqual(getGoDesignRuntimeConfig.command("production"), getGoDesignRuntimeConfig.command("development"));
});
