import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultGetGoAccessPolicy,
  getGoAccessPolicySchema,
  getGoConfigurableFeatures,
} from "../src/features/payment-packages/domain/access-policy.js";

test("default access policy defines limits and every configurable feature for both tiers", () => {
  const policy = getGoAccessPolicySchema.parse(defaultGetGoAccessPolicy);
  for (const tier of ["free", "premium"] as const) {
    assert.deepEqual(Object.keys(policy.packages[tier].features).sort(), [...getGoConfigurableFeatures].sort());
  }
  assert.equal(policy.packages.free.studentLimit, 2);
  assert.equal(policy.packages.free.topicLimitPerStudent, 5);
  assert.equal(policy.packages.premium.studentLimit, -1);
  assert.equal(policy.packages.admin.studentLimit, -1);
  assert.equal(policy.packages.admin.topicLimitPerStudent, -1);
});

test("access policy rejects invalid quota values", () => {
  const policy = structuredClone(defaultGetGoAccessPolicy);
  policy.packages.free.studentLimit = 0;
  assert.equal(getGoAccessPolicySchema.safeParse(policy).success, false);
});

test("legacy null quotas are normalized to -1", () => {
  const policy = structuredClone(defaultGetGoAccessPolicy) as unknown as { packages: { premium: { studentLimit: null } } };
  policy.packages.premium.studentLimit = null;
  assert.equal(getGoAccessPolicySchema.parse(policy).packages.premium.studentLimit, -1);
});
