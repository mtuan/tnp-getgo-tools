import assert from "node:assert/strict";
import test from "node:test";
import { defaultPremiumMembershipPeriod } from "../src/features/members/domain/premium-membership-period";

test("defaults a Premium membership to today through 30 calendar days later", () => {
  assert.deepEqual(defaultPremiumMembershipPeriod(new Date(2026, 9, 9, 16, 30)), {
    startsAt: "2026-10-09",
    expiresAt: "2026-11-08",
  });
});

test("calculates the 30-day end date across month and year boundaries", () => {
  assert.deepEqual(defaultPremiumMembershipPeriod(new Date(2026, 11, 15, 8)), {
    startsAt: "2026-12-15",
    expiresAt: "2027-01-14",
  });
});
