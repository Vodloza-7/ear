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
    )

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
describe("ban appeal decision ",  () =>{
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it ("approves an awaiting_review ban appeal and lifts the matching ban", async () => {
    const appealSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        ban_id: "ban-456",
        status: "awaiting_review"
      }),
    };
    const banSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        status: "active",
        ban_type: "standard",
      }),
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot).mockResolvedValueOnce(banSnapshot);
    const result = await store.decideBanAppeal("appeal-123", "approved", "host-1");
    expect(transaction.update).toHaveBeenCalledTimes(2);
    expect(transaction.update).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
      status: "approved",
      reviewed_by: "host-1",
    }),
    );
    expect(transaction.update).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
      status: "lifted",
    }),
    );

    expect(result).toEqual(
    expect.objectContaining({
      appeal_id: "appeal-123",
      ban_id: "ban-456",
      user_id: "user-123",
      decision: "approved",
      reviewed_by: "host-1",
    })
    );
  });
  it("denies an awaiting_review ban appeal and keeps the matching ban active", async () => {
    const appealSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        ban_id: "ban-456",
        status: "awaiting_review"
      }),
    };
    const banSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        status: "active",
        ban_type: "standard",
      }),
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot).mockResolvedValueOnce(banSnapshot);
    const result = await store.decideBanAppeal("appeal-123", "denied", "host-1");
    expect(transaction.update).toHaveBeenCalledTimes(1);
    expect(transaction.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "denied",
        reviewed_by: "host-1",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        appeal_id: "appeal-123",
        ban_id: "ban-456",
        user_id: "user-123",
        decision: "denied",
        reviewed_by: "host-1",
      })
    );

  });
  it("rejects approval of an extreme ban appeal", async () => {
    const appealSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        ban_id: "ban-456",
        status: "awaiting_review"
      }),
    };
    const banSnapshot = {
      exists: true,
        data: () => ({
          user_id: "user-123",
          status: "active",
          ban_type: "extreme",
        }),
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot).mockResolvedValueOnce(banSnapshot);
    await expect(store.decideBanAppeal("appeal-123", "approved", "host-1")).rejects.toThrowError(
   "Cannot approve appeal for extreme ban."
    );
    expect(transaction.update).not.toHaveBeenCalled();
  });
  it("rejects a ban that belong to another user", async () => {
    const appealSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
          ban_id: "ban-456",
          status: "awaiting_review"
      }),
    };
    const banSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-456",
        status: "active",
        ban_type: "standard",
      }),
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot).mockResolvedValueOnce(banSnapshot);
    await expect(store.decideBanAppeal("appeal-123", "approved", "host-1")).rejects.toThrowError(
      "Ban appeal user ID does not match ban user ID."
    );
    expect(transaction.update).not.toHaveBeenCalled();
  });
  it("does not change an appeal that has already been decided", async () => {
    const appealSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        ban_id: "ban-456",
        status: "approved"
      }),
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot);
    const result = await store.decideBanAppeal("appeal-123", "denied", "host-1");
    expect(result).toBeNull();
    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.update).not.toHaveBeenCalled();
  });
  it("does not decide an appeal that is still payment_required", async () => {
    const appealSnapshot = {
      exists: true,
      data: () => ({
        user_id: "user-123",
        ban_id: "ban-456",
        status: "payment_required"
      }),
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot);
    const result = await store.decideBanAppeal("appeal-123", "denied", "host-1");
    expect(result).toBeNull();
    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.update).not.toHaveBeenCalled();
  });
  it("does not decide when the appeal does not exist", async() => {
    const appealSnapshot = {
      exists: false,
      data: () => undefined,
    };
    transaction.get.mockRejectedValueOnce(appealSnapshot);
    await expect(
      store.decideBanAppeal(
        "missing-appeal",
        "approved",
        "host-1",
      ),
    ).rejects.toThrow();
    expect(transaction.get).toHaveBeenCalledTimes(1);
    expect(transaction.update).not.toHaveBeenCalled();
     }
  )
  it("does not decide when the ban does not exist but the appeal exists and is eligible"), async () => {
    const appealSnapshot = {
      exists: false,
      data: () => ({
        user_id: "user-123" ,
        ban_id: "missing-ban",
        status: "awaiting review",
      }),
    };
    const banSnapshot = {
      exists: false,
      data: () => undefined,
    };
    transaction.get.mockResolvedValueOnce(appealSnapshot).mockResolvedValueOnce(banSnapshot);
    await expect(store.decideBanAppeal(
      "appeal-123",
      "approved",
      "host-1",
    ),
  ).rejects.toThrow();
  expect(transaction.get).toHaveBeenCalledTimes(2);
  expect(transaction.update).not.toHaveBeenCalled();
  }
});
