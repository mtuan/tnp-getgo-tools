import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentEvent, PaymentPackage } from "../src/shared/domain/models.js";
import { paymentEventsForEnvironment, paymentPackagesForEnvironment } from "../src/features/payment-packages/domain/payment-environment.js";

const paymentPackage = (id: string, targetEnvironments: PaymentPackage["targetEnvironments"]): PaymentPackage => ({
  id, platform: "web", type: "monthly", targetEnvironments,
  name: { en: id, vi: id }, info: { en: "", vi: "" }, benefits: { en: [], vi: [] },
  price: { amount: 100_000, currency: "VND" },
});

test("package sync selects only the active environment and strips deployment metadata", () => {
  const result = paymentPackagesForEnvironment([
    paymentPackage("development-only", ["development"]),
    paymentPackage("production-only", ["production"]),
    paymentPackage("shared", ["staging", "production"]),
  ], "production");
  assert.deepEqual(result.map((item) => item.id), ["production-only", "shared"]);
  assert.ok(result.every((item) => !("targetEnvironments" in item)));
});

test("event sync selects sales and premium previews for the active environment", () => {
  const events: PaymentEvent[] = [
    { id: "staging-sale", type: "sale", targetEnvironments: ["staging"], name: { en: "Sale", vi: "Sale" }, info: { en: "", vi: "" }, recurrence: "one-time", startsOn: "2026-10-01", endsOn: "2026-10-31", enabled: true, discountPercent: 10, targets: { packageIds: ["monthly"] } },
    { id: "preview", type: "premium-preview", targetEnvironments: ["staging"], name: { en: "Preview", vi: "Preview" }, info: { en: "", vi: "" }, recurrence: "one-time", startsOn: "2026-10-01", endsOn: "2026-10-31", enabled: true, premiumDays: 14, targets: { userTypes: ["new-registration"], platforms: ["web"] } },
  ];
  const production = paymentEventsForEnvironment(events, "production");
  assert.deepEqual(production.map((item) => item.id), []);
  const staging = paymentEventsForEnvironment(events, "staging");
  assert.deepEqual(staging.map((item) => item.id), ["staging-sale", "preview"]);
  assert.ok(staging.every((item) => !("targetEnvironments" in item)));
});
