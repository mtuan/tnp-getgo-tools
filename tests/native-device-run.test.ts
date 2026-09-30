import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getGoWebNativeConfig } from "../src/features/deployment/main/native-deployment-jobs.js";

test("connected iPhone runs use the native iOS run command with device mode", () => {
  assert.deepEqual(
    getGoWebNativeConfig.command("run-device", "ios", "development"),
    { script: "native:run:ios", args: ["development", "--device"] },
  );
});

test("native deployment UI exposes a dedicated connected-iPhone action", () => {
  const source = readFileSync(new URL("../src/features/deployment/components/NativeDeploymentCards.tsx", import.meta.url), "utf8");
  assert.match(source, /onRun\("run-device", component\)/);
  assert.match(source, /copy\.usb/);
  assert.doesNotMatch(source, /onRun\("build", component\)/);
});
