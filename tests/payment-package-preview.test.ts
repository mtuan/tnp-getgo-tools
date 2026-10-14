import assert from "node:assert/strict";
import test from "node:test";
import { accessPolicyBenefits, orderedPreviewPackages, packageBenefits } from "../src/features/payment-packages/components/PaymentPackagesPreview";
import { defaultGetGoAccessPolicy } from "../src/features/payment-packages/domain/access-policy";
import type { PaymentPackage } from "../src/shared/domain/models";

const paymentPackage = (id: string, type: PaymentPackage["type"]): PaymentPackage => ({
  id,
  type,
  name: { en: id, vi: id },
  info: { en: "", vi: "" },
  benefits: { en: [], vi: [] },
  price: { amount: type === "free" ? 0 : 100_000, currency: "VND" },
});

test("preview benefits follow the free access-policy configuration", () => {
  const benefits = accessPolicyBenefits(defaultGetGoAccessPolicy, "free", "en");

  assert.deepEqual(benefits.slice(0, 2), [
    "Up to 2 student profiles",
    "Up to 5 active topics per student",
  ]);
  assert.ok(benefits.includes("Question feedback"));
  assert.ok(!benefits.includes("All Premium content"));
  assert.ok(!benefits.includes("Question notes"));
});

test("preview benefits follow the premium access-policy configuration and locale", () => {
  const benefits = accessPolicyBenefits(defaultGetGoAccessPolicy, "premium", "vi");

  assert.equal(benefits[0], "Không giới hạn hồ sơ học sinh");
  assert.ok(benefits.includes("Toàn bộ Nội dung Premium"));
  assert.ok(benefits.includes("Ghi chú câu hỏi"));
});

test("card benefits exclude capabilities shared by every card", () => {
  const benefits = packageBenefits(defaultGetGoAccessPolicy, [
    paymentPackage("free", "free"),
    paymentPackage("monthly", "monthly"),
    paymentPackage("annual", "annual"),
  ], "en");

  assert.deepEqual(benefits.get("free"), [
    { label: "Up to 2 student profiles", supported: true },
    { label: "All Premium content", supported: false },
    { label: "Question notes", supported: false },
  ]);
  assert.deepEqual(benefits.get("monthly"), [
    { label: "Unlimited student profiles", supported: true },
    { label: "All Premium content", supported: true },
    { label: "Question notes", supported: true },
  ]);
  assert.deepEqual(benefits.get("annual"), benefits.get("monthly"));
});

test("preview cards are always ordered free, monthly, then annual", () => {
  const items = [
    paymentPackage("annual", "annual"),
    paymentPackage("legacy", "one-time"),
    paymentPackage("free", "free"),
    paymentPackage("monthly", "monthly"),
  ];

  assert.deepEqual(orderedPreviewPackages(items).map(item => item.id), [
    "free",
    "monthly",
    "annual",
    "legacy",
  ]);
});
