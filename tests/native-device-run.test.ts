import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getGoWebNativeConfig, nativeDeploymentStepDefinitions } from "../src/features/deployment/main/native-deployment-jobs.js";

test("connected iPhone runs use the native iOS run command with device mode", () => {
  assert.deepEqual(
    getGoWebNativeConfig.command("run-device", "ios", "development"),
    { script: "native:run:ios", args: ["development", "--device"] },
  );
});

test("iOS deployment summary and report use the same four real phases", () => {
  assert.deepEqual(nativeDeploymentStepDefinitions("deploy", "ios"), [
    { id: "prepare", label: "Prepare Web and iOS project" },
    { id: "archive", label: "Archive signed iOS app" },
    { id: "export", label: "Export IPA" },
    { id: "upload", label: "Upload to App Store Connect" },
  ]);
});

test("the Capacitor workflow emits structured progress for every iOS deployment phase", () => {
  const source = readFileSync(new URL("../../tnp-getgo-web/scripts/capacitor.mjs", import.meta.url), "utf8");
  for (const phase of ["prepare", "archive", "export", "upload"]) {
    assert.match(source, new RegExp(`nativeProgress\\('${phase}'.*'running'\\)`));
    assert.match(source, new RegExp(`nativeProgress\\('${phase}'.*'completed'\\)`));
  }
});

test("native deployment UI exposes a dedicated connected-iPhone action", () => {
  const source = readFileSync(new URL("../src/features/deployment/components/NativeDeploymentCards.tsx", import.meta.url), "utf8");
  assert.match(source, /onRun\("run-device", component\)/);
  assert.match(source, /copy\.usb/);
  assert.doesNotMatch(source, /onRun\("build", component\)/);
});
