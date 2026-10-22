import assert from "node:assert/strict";
import test from "node:test";
import type { PaymentEvent, PaymentPackage } from "../src/shared/domain/models.js";
import { nativeOfferIsActive, targetNativePackages, unexpectedStoreOffers } from "../src/features/payment-packages/main/native-store-offers.js";

const sale: Extract<PaymentEvent, { type: "sale" }> = {
  id: "new-year", type: "sale", name: { en: "New Year", vi: "Năm mới" }, info: { en: "", vi: "" },
  recurrence: "yearly", startsOn: "2026-12-28", endsOn: "2027-01-05", enabled: true,
  targetEnvironments: ["production"], discountPercent: 20, targets: { packageIds: ["web-monthly"] },
};
const pkg = (id: string, platform: PaymentPackage["platform"], type: PaymentPackage["type"]): PaymentPackage => ({
  id, platform, type, targetEnvironments: ["production"], name: { en: id, vi: id }, info: { en: "", vi: "" },
  benefits: { en: [], vi: [] }, price: { amount: 49_000, currency: "VND" },
});

test("maps a selected Web plan to equivalent native introductory plans", () => {
  const packages = [pkg("web-monthly", "web", "monthly"), pkg("ios-monthly", "ios", "monthly"), pkg("android-monthly", "android", "monthly"), pkg("ios-annual", "ios", "annual")];
  assert.deepEqual(targetNativePackages(sale, packages).map(item => item.id), ["ios-monthly", "android-monthly"]);
});

test("yearly native offer windows wrap across New Year", () => {
  assert.equal(nativeOfferIsActive(sale, "2026-12-31"), true);
  assert.equal(nativeOfferIsActive(sale, "2027-01-03"), true);
  assert.equal(nativeOfferIsActive(sale, "2027-06-01"), false);
});

test("authoritative reconciliation identifies every console offer absent from Tools", () => {
  const existing = [{ id: "managed" }, { id: "manual-sale" }, { id: "old-sale" }];
  assert.deepEqual(unexpectedStoreOffers(existing, new Set(["managed"]), item => item.id), [
    { id: "manual-sale" },
    { id: "old-sale" },
  ]);
});
