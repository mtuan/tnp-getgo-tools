import assert from "node:assert/strict";
import test from "node:test";
import { resolveIosSigningState } from "../src/features/deployment/main/native-deployment-jobs.js";

test("iOS signing badge state follows effective native environment values", () => {
  assert.deepEqual(resolveIosSigningState({}), { style: "automatic", configured: true });
  assert.deepEqual(resolveIosSigningState({ GETGO_IOS_SIGNING_STYLE: " AUTOMATIC " }), { style: "automatic", configured: true });
  assert.deepEqual(resolveIosSigningState({
    GETGO_IOS_SIGNING_STYLE: "manual",
    GETGO_IOS_PROVISIONING_PROFILE: " GetGo AppStore Distribution 2026 ",
    GETGO_IOS_SIGNING_CERTIFICATE: " Apple Distribution ",
  }), {
    style: "manual",
    configured: true,
    provisioningProfile: "GetGo AppStore Distribution 2026",
    certificate: "Apple Distribution",
  });
  assert.deepEqual(resolveIosSigningState({ GETGO_IOS_SIGNING_STYLE: "manual" }), {
    style: "manual",
    configured: false,
    provisioningProfile: undefined,
    certificate: "Apple Distribution",
  });
  assert.deepEqual(resolveIosSigningState({ GETGO_IOS_SIGNING_STYLE: "cloud" }), {
    style: "invalid",
    configured: false,
  });
});
