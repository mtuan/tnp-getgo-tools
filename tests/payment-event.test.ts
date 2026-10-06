import assert from "node:assert/strict";
import test from "node:test";
import { paymentEventSchema, paymentEventsSchema, suggestPaymentEventId } from "../src/features/payment-packages/domain/payment-event.js";

const base = {
  id: "welcome-event",
  name: { en: "Welcome", vi: "Chào mừng" },
  info: { en: "", vi: "" },
  recurrence: "one-time" as const,
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  enabled: true,
};

test("accepts sale package targets", () => {
  const event = paymentEventSchema.parse({
    ...base,
    type: "sale",
    discountPercent: 25,
    targets: { packageIds: ["getgo-family-annual"] },
  });
  assert.equal(event.type, "sale");
});

test("accepts premium preview user targets", () => {
  const event = paymentEventSchema.parse({
    ...base,
    type: "premium-preview",
    premiumDays: 14,
    targets: { userTypes: ["new-registration", "legacy-migration"] },
  });
  assert.equal(event.type, "premium-preview");
});

test("rejects an inverted event date range", () => {
  assert.throws(() => paymentEventSchema.parse({
    ...base,
    startsOn: "2026-11-01",
    type: "premium-preview",
    premiumDays: 14,
    targets: { userTypes: ["new-registration"] },
  }));
});

test("suggests a slug and increments it until it is unique", () => {
  assert.equal(suggestPaymentEventId("Back to School!", []), "back-to-school");
  assert.equal(suggestPaymentEventId("Back to School!", ["back-to-school", "back-to-school-2"]), "back-to-school-3");
});

test("rejects duplicate event IDs in a saved collection", () => {
  const event = { ...base, type: "sale", discountPercent: 25, targets: { packageIds: ["annual"] } };
  assert.throws(() => paymentEventsSchema.parse([event, event]));
});
