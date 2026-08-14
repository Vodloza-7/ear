import { describe, expect, it } from "vitest";
import {
  BAN_APPEAL_CHECKOUT_ATTEMPT_LEASE_MS,
  isBanAppealCheckoutAttemptStale
} from "./store";

describe("ban appeal checkout attempt leases", () => {
  const now = new Date("2026-08-16T09:00:00.000Z");

  it("keeps a recent pending attempt active", () => {
    const startedAt = new Date(
      now.getTime() - BAN_APPEAL_CHECKOUT_ATTEMPT_LEASE_MS + 1
    );

    expect(isBanAppealCheckoutAttemptStale(startedAt, now)).toBe(false);
  });

  it("allows takeover when the pending attempt lease expires", () => {
    const startedAt = new Date(
      now.getTime() - BAN_APPEAL_CHECKOUT_ATTEMPT_LEASE_MS
    );

    expect(isBanAppealCheckoutAttemptStale(startedAt, now)).toBe(true);
  });

  it("allows takeover when an old pending attempt has no lease timestamp", () => {
    expect(isBanAppealCheckoutAttemptStale(undefined, now)).toBe(true);
  });
});
