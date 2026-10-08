import assert from "node:assert/strict";
import test from "node:test";
import type { BillingOrderDetail } from "../src/shared/domain/models";
import { billingOrderWarnings, decodeFirestoreValue, sanitizeBillingRecord } from "../src/features/payment-orders/main/billing-order-read-service.js";

test("Firestore billing values are decoded recursively", () => {
  assert.deepEqual(decodeFirestoreValue({ mapValue: { fields: {
    status: { stringValue: "paid" },
    amount: { integerValue: "120000" },
    flags: { arrayValue: { values: [{ booleanValue: true }, { nullValue: null }] } },
  } } }), { status: "paid", amount: 120000, flags: [true, null] });
});

test("billing payload sanitization removes secrets and masks bank accounts", () => {
  assert.deepEqual(sanitizeBillingRecord({
    qrCode: "private-qr", authorization: "Bearer secret", bankAccount: "1234567890",
    request: { password: "secret", safe: "value" },
  }), { bankAccount: "******7890", request: { safe: "value" } });
});

test("billing order audit detects inconsistent payment state", () => {
  const partial: Omit<BillingOrderDetail, "warnings"> = {
    order: { id: "ORDER1", transactionId: "tx1", parentUid: "user1", purchaseType: "subscription", productId: "annual", productName: "Annual", topicId: null, provider: "vietqr", amount: 100, currency: "VND", status: "paid", environment: "sandbox", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", checkoutExpiresAt: null, duplicatePaymentCount: 1 },
    transaction: { id: "tx1", status: "pending", providerTransactionId: "", referenceNumber: "", providerTransactionTime: null, paidAt: null, failedAt: null, cancelledAt: null, expiredAt: null, updatedAt: null },
    user: null, product: null, access: null, pending: false, duplicatePayments: [], events: [],
  };
  const warnings = billingOrderWarnings(partial);
  assert.ok(warnings.includes("status-mismatch"));
  assert.ok(warnings.includes("missing-user"));
  assert.ok(warnings.includes("missing-access"));
  assert.ok(warnings.includes("duplicate-count-mismatch"));
  assert.ok(!warnings.includes("missing-pending"));

  const pendingWarnings = billingOrderWarnings({
    ...partial,
    order: { ...partial.order, status: "pending" },
    transaction: { ...partial.transaction!, status: "pending" },
  });
  assert.ok(pendingWarnings.includes("missing-pending"));
});
