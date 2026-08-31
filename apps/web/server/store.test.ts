import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreMocks = vi.hoisted(() => ({
  adminFirestore: vi.fn(),
  runTransaction: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  transactionGet: vi.fn(),
  transactionUpdate: vi.fn()
}));

vi.mock("./firebase", () => ({
  adminFirestore: firestoreMocks.adminFirestore
}));

import {
  BAN_APPEAL_CHECKOUT_ATTEMPT_LEASE_MS,
  isBanAppealCheckoutAttemptStale,
  store
} from "./store";

const documentRef = { id: "appeal-123" };
const transaction = {
  get: firestoreMocks.transactionGet,
  update: firestoreMocks.transactionUpdate
};

beforeEach(() => {
  vi.clearAllMocks();

  firestoreMocks.doc.mockReturnValue(documentRef);
  firestoreMocks.collection.mockReturnValue({
    doc: firestoreMocks.doc
  });
  firestoreMocks.adminFirestore.mockReturnValue({
    collection: firestoreMocks.collection,
    runTransaction: firestoreMocks.runTransaction
  });
  firestoreMocks.runTransaction.mockImplementation(
    async (
      callback: (value: typeof transaction) => Promise<boolean>
    ) => callback(transaction)
  );
});

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

describe("failBanAppealCheckoutSession", () => {
  it("changes a matching ready session to failed", async () => {
    firestoreMocks.transactionGet.mockResolvedValue({
      exists: true,
      data: () => ({
        id: "appeal-123",
        status: "payment_required",
        stripe_checkout_session_id: "cs-old",
        stripe_checkout_attempt_state: "ready"
      })
    });

    const result = await store.failBanAppealCheckoutSession(
      "appeal-123",
      "cs-old"
    );

    expect(result).toBe(true);
    expect(firestoreMocks.transactionUpdate).toHaveBeenCalledTimes(1);
    expect(firestoreMocks.transactionUpdate).toHaveBeenCalledWith(
      documentRef,
      {
        stripe_checkout_attempt_state: "failed",
        updated_at: expect.any(Date)
      }
    );
  });

  it("does not let an old failure overwrite a pending replacement", async () => {
    firestoreMocks.transactionGet.mockResolvedValue({
      exists: true,
      data: () => ({
        id: "appeal-123",
        status: "payment_required",
        stripe_checkout_session_id: "cs-old",
        stripe_checkout_attempt_state: "pending"
      })
    });

    const result = await store.failBanAppealCheckoutSession(
      "appeal-123",
      "cs-old"
    );

    expect(result).toBe(false);
    expect(firestoreMocks.transactionUpdate).not.toHaveBeenCalled();
  });
});
