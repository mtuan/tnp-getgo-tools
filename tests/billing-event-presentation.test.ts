import assert from "node:assert/strict";
import test from "node:test";
import type { BillingOrderEvent } from "../src/shared/domain/models";
import { billingEventActor, billingEventDisplayStatus, billingEventTransactionRefId, showBillingEvent } from "../src/features/payment-orders/billing-event-presentation";

const event = (name: string, success: boolean | null = null, direction = ""): BillingOrderEvent => ({
  id: name,
  event: name,
  createdAt: null,
  success,
  direction,
  endpoint: "",
  httpStatus: null,
  durationMs: null,
  detail: {},
});

test("billing event statuses follow the documented priority", () => {
  assert.equal(billingEventDisplayStatus(event("vietqr.token.requested")), "inProgress");
  assert.equal(billingEventDisplayStatus(event("callback.transaction.received")), "processing");
  assert.equal(billingEventDisplayStatus(event("callback.transaction.accepted")), "success");
  assert.equal(billingEventDisplayStatus(event("callback.transaction.rejected")), "rejected");
  assert.equal(billingEventDisplayStatus(event("vietqr.qr.responded", true)), "success");
  assert.equal(billingEventDisplayStatus(event("callback.transaction.accepted", false)), "failed");
});

test("sandbox simulation events are hidden only in production", () => {
  const simulation = event("sandbox.simulation.requested");
  assert.equal(showBillingEvent(simulation, "sandbox"), true);
  assert.equal(showBillingEvent(simulation, "production"), false);
  assert.equal(showBillingEvent(event("checkout.created", true), "production"), true);
});

test("VietQR QR response exposes its provider transaction reference", () => {
  const qrResponse = event("vietqr.qr.responded", true);
  qrResponse.detail = { response: { transactionRefId: "VQR-REF-123", qrCode: "redacted" } };
  assert.equal(billingEventTransactionRefId(qrResponse), "VQR-REF-123");
  assert.equal(billingEventTransactionRefId(event("checkout.created", true)), null);
});

test("billing events identify the system that initiated each event", () => {
  assert.equal(billingEventActor(event("vietqr.token.requested", null, "outbound")), null);
  assert.equal(billingEventActor(event("vietqr.token.responded", true, "inbound")), "vietqr");
  assert.equal(billingEventActor(event("sandbox.simulation.requested", null, "outbound")), null);
  assert.equal(billingEventActor(event("sandbox.simulation.responded", true, "inbound")), "vietqr");
  assert.equal(billingEventActor(event("checkout.created", true)), null);
  assert.equal(billingEventActor(event("callback.transaction.received", null, "inbound")), "vietqr");
  assert.equal(billingEventActor(event("callback.transaction.accepted", true)), null);
  assert.equal(billingEventActor(event("vietqr.qr.responded", true)), "vietqr");
});
